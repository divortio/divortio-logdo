/**
 * @file src/logDO.mjs
 * @description Defines the LogBatcher Durable Object. It initializes the database schema
 * for multiple tables, manages independent in-memory batches for each, and handles
 * long-running migrations gracefully. It also contains the logic for cron-triggered data retention,
 * sends detailed operational metrics, and snapshots its state to KV.
 * @module LogBatcher
 */

import {DurableObject} from "cloudflare:workers";
import {initDB} from './schema/schemaManager.mjs';
import {pruneTable} from './filter/pruneRetention.mjs';
import {
    sendBatchWriteMetric,
    sendSchemaMigrationMetric,
    sendDataPruningMetric
} from './wae/operationalMetrics.mjs';
import {
    updateBatcherState,
    saveLastFirehoseBatch,
    saveLastFirehoseEvent,
    saveFailedBatch,
    updatePruningSummary,
    registerActiveDO
} from './kv/index.mjs';

/**
 * @typedef {import('./filter/logPlanManager.mjs').CompiledLogRoute} CompiledLogRoute
 * @typedef {import('@cloudflare/workers-types').DurableObjectState} DurableObjectState
 * @typedef {import('@cloudflare/workers-types').D1Database} D1Database
 * @typedef {import('@cloudflare/workers-types').KVNamespace} KVNamespace
 * @typedef {import('@cloudflare/workers-types').AnalyticsEngineDataset} AnalyticsEngineDataset
 */

/**
 * @typedef {object} Env
 * @property {D1Database} LOGGING_DB
 * @property {KVNamespace} LOGDO_STATE
 * @property {AnalyticsEngineDataset} METRICS_BATCH_WRITES
 * @property {AnalyticsEngineDataset} METRICS_SCHEMA_MIGRATIONS
 * @property {AnalyticsEngineDataset} METRICS_DATA_PRUNING
 * @property {string} [LOG_HOSE_TABLE]
 * @property {number} [BATCH_INTERVAL_MS]
 * @property {number} [MAX_BATCH_SIZE]
 * @property {string} [colo]
 */

/**
 * A Durable Object class that acts as an RPC service for batching logs and handling scheduled tasks.
 *
 * @class
 * @extends DurableObject
 */
export class LogBatcher extends DurableObject {
    /** @private @type {DurableObjectState} */
    _ctx;
    /** @private @type {Env} */
    _env;
    /** @private @type {Map<string, Array<object>>} */
    _batches;
    /** @private @type {number} */
    _batchIntervalMs;
    /** @private @type {number} */
    _maxBatchSize;
    /** @private @type {Map<string, Promise<void>>} */
    _initPromises;
    /** @private @type {Array<CompiledLogRoute> | null} */
    _logPlan = null;

    /**
     * @param {DurableObjectState} ctx
     * @param {Env} env
     */
    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
        this._batches = new Map();
        this._initPromises = new Map();
        this._batchIntervalMs = this._env.BATCH_INTERVAL_MS || 10000;
        this._maxBatchSize = this._env.MAX_BATCH_SIZE || 200;
    }

    /**
     * Initializes the database schema for a given route if it hasn't been initialized
     * or if the schema has changed.
     * @private
     * @param {CompiledLogRoute} route - The compiled log route containing schema info.
     * @returns {Promise<void>}
     */
    initialize(route) {
        const {tableName, schemaHash} = route;
        if (this._initPromises.has(tableName)) {
            return this._initPromises.get(tableName);
        }

        const initPromise = (async () => {
            const storageKey = `schema_hash_${tableName}`;
            const storedHash = await this._ctx.storage.get(storageKey);

            if (storedHash !== schemaHash) {
                const startTime = Date.now();
                const tableExists = !!storedHash;

                await initDB(this._env, storedHash, route);
                await this._ctx.storage.put(storageKey, schemaHash);

                const durationMs = Date.now() - startTime;
                const migrationType = tableExists ? 'alter_table' : 'create_table';
                sendSchemaMigrationMetric(this._env, route, migrationType, durationMs);
            }
        })();

        this._initPromises.set(tableName, initPromise);
        return initPromise;
    }

    /**
     * [RPC Method] Sets the compiled log plan for this Durable Object instance.
     * This ensures the DO has the necessary context to perform its tasks, like flushing batches.
     * @param {Array<CompiledLogRoute>} plan The compiled log plan from the main worker.
     * @returns {void}
     */
    setLogPlan(plan) {
        this._logPlan = plan;
    }

    /**
     * [RPC Method] Adds a log entry to the appropriate in-memory batch.
     * Triggers an immediate batch write if the batch size exceeds the configured maximum.
     * Also sets an alarm to ensure logs are written periodically.
     * @param {object} logData - The structured log object.
     * @param {Array<CompiledLogRoute>} matchedRoutes - The routes this log should be written to.
     * @returns {Promise<void>}
     */
    async addLog(logData, matchedRoutes) {
        for (const route of matchedRoutes) {
            if (!this._batches.has(route.tableName)) {
                this._batches.set(route.tableName, []);
            }
            const batch = this._batches.get(route.tableName);
            batch.push(logData);

            if (batch.length >= this._maxBatchSize) {
                this._ctx.waitUntil(this._writeBatchToD1(route).catch(e => {
                    console.error(`[DO BATCHER] Unhandled error during immediate batch write for table "${route.tableName}":`, e);
                }));
            }
        }
        await this._ctx.storage.setAlarm(Date.now() + this._batchIntervalMs);
    }

    /**
     * [RPC Method] Triggered by the cron schedule to run data retention checks.
     * @param {CompiledLogRoute} route - The route containing retention policy details.
     * @returns {Promise<void>}
     */
    async runRetentionCheck(route) {
        const {tableName, retentionDays, pruningIntervalDays} = route;
        const lastPrunedKey = `lastPruned_${tableName}`;
        const lastPrunedTimestamp = await this._ctx.storage.get(lastPrunedKey) || 0;
        const now = Date.now();
        const intervalMs = (pruningIntervalDays || 1) * 24 * 60 * 60 * 1000;

        if (now - lastPrunedTimestamp > intervalMs) {
            console.log(`[DO Pruner] Time to prune table: ${tableName}`);
            await this.initialize(route);

            const startTime = Date.now();
            let outcome = 'success';
            let rowsDeleted = 0;
            try {
                rowsDeleted = await pruneTable(this._env.LOGGING_DB, tableName, retentionDays);
                await this._ctx.storage.put(lastPrunedKey, now);
            } catch (e) {
                outcome = 'failure';
                console.error(`[DO Pruner] Pruning failed for table "${tableName}":`, e);
            } finally {
                const durationMs = Date.now() - startTime;
                sendDataPruningMetric(this._env, tableName, outcome, rowsDeleted, durationMs);
                this._ctx.waitUntil(updatePruningSummary(this._env.LOGDO_STATE, tableName, rowsDeleted, durationMs).catch(err => {
                    console.error(`[DO Pruner] Failed to update pruning summary for "${tableName}":`, err);
                }));
            }
        }
    }

    /**
     * Triggered by `setAlarm`. This method is the primary mechanism for periodically
     * flushing all in-memory log batches to the D1 database.
     * @returns {Promise<void>}
     */
    async alarm() {
        const doId = this._ctx.id.toString();
        const colo = this._env.colo || 'unknown';
        this._ctx.waitUntil(updateBatcherState(this._env.LOGDO_STATE, doId, this._batches).catch(err => {
            console.error(`[DO Alarm] Failed to update batcher state for DO "${doId}":`, err);
        }));
        this._ctx.waitUntil(registerActiveDO(this._env.LOGDO_STATE, doId, colo).catch(err => {
            console.error(`[DO Alarm] Failed to register active DO "${doId}":`, err);
        }));

        if (!this._logPlan) {
            console.error(`[DO Alarm] Cannot flush batches: Log plan has not been set for this instance.`);
            return;
        }

        const writePromises = [];
        for (const [tableName, batch] of this._batches.entries()) {
            if (batch.length > 0) {
                const route = this._logPlan.find(r => r.tableName === tableName);
                if (route) {
                    writePromises.push(this._writeBatchToD1(route));
                } else {
                    console.error(`[DO Alarm] Could not find route for table "${tableName}" in the log plan. Batch will be retried.`);
                }
            }
        }
        await Promise.all(writePromises);
    }

    /**
     * Writes a batch of logs for a specific route to the D1 database. This method is designed
     * to be race-condition-safe by immediately clearing the batch it intends to write.
     * @private
     * @param {CompiledLogRoute} route - The route for which to write the batch.
     * @returns {Promise<void>}
     */
    async _writeBatchToD1(route) {
        const {tableName, schema} = route;

        // **RACE CONDITION FIX**: Immediately grab the batch to write and replace it with an empty array.
        // This prevents new logs from being lost if `addLog` is called while this write is in progress.
        const batchToWrite = this._batches.get(tableName) || [];
        if (batchToWrite.length === 0) {
            return;
        }
        this._batches.set(tableName, []);

        await this.initialize(route);

        const startTime = Date.now();
        let outcome = 'success';
        try {
            const columns = Object.keys(schema);
            const placeholders = columns.map(() => `?`).join(', ');

            const stmts = batchToWrite.map(log => {
                const values = columns.map(col => log[col] ?? null);
                return this._env.LOGGING_DB.prepare(
                    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
                ).bind(...values);
            });

            await this._env.LOGGING_DB.batch(stmts);
            console.log(`[DO BATCHER] Successfully wrote batch of ${batchToWrite.length} logs to "${tableName}".`);

            if (tableName === this._env.LOG_HOSE_TABLE) {
                this._ctx.waitUntil(saveLastFirehoseBatch(this._env.LOGDO_STATE, batchToWrite).catch(err => {
                    console.error(`[DO BATCHER] Failed to save last firehose batch:`, err);
                }));
                if (batchToWrite.length > 0) {
                    this._ctx.waitUntil(saveLastFirehoseEvent(this._env.LOGDO_STATE, batchToWrite[batchToWrite.length - 1]).catch(err => {
                        console.error(`[DO BATCHER] Failed to save last firehose event:`, err);
                    }));
                }
            }

        } catch (e) {
            outcome = 'failure';
            console.error(`[DO BATCHER] D1 batch write to "${tableName}" failed:`, e);
            this._ctx.waitUntil(saveFailedBatch(this._env.LOGDO_STATE, tableName, e, batchToWrite).catch(err => {
                console.error(`[DO BATCHER] Failed to save failed batch details:`, err);
            }));
            // Retry failed logs by prepending them to the current batch.
            const existingBatch = this._batches.get(tableName) || [];
            this._batches.set(tableName, [...batchToWrite, ...existingBatch]);
        } finally {
            const durationMs = Date.now() - startTime;
            sendBatchWriteMetric(this._env, tableName, outcome, batchToWrite.length, durationMs);
        }
    }
}