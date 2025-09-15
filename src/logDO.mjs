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
    /** @private @type {object} */
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
     * @param {object} env
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
     * @private
     * @param {CompiledLogRoute} route
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
     */
    setLogPlan(plan) {
        this._logPlan = plan;
    }

    /**
     * @param {object} logData
     * @param {Array<CompiledLogRoute>} matchedRoutes
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
                this._ctx.waitUntil(this._writeBatchToD1(route));
            }
        }
        await this._ctx.storage.setAlarm(Date.now() + this._batchIntervalMs);
    }

    /**
     * @param {CompiledLogRoute} route
     * @returns {Promise<void>}
     */
    async runRetentionCheck(route) {
        const {tableName, retentionDays, pruningIntervalDays} = route;
        const lastPrunedKey = `lastPruned_${tableName}`;
        const lastPrunedTimestamp = await this._ctx.storage.get(lastPrunedKey);
        const now = Date.now();
        const intervalMs = (pruningIntervalDays || 1) * 24 * 60 * 60 * 1000;

        if (!lastPrunedTimestamp || (now - lastPrunedTimestamp > intervalMs)) {
            console.log(`[DO Pruner] Time to prune table: ${tableName}`);
            await this.initialize(route);

            const startTime = Date.now();
            let outcome = 'success';
            let rowsDeleted = 0;
            try {
                const result = await pruneTable(this._env.LOGGING_DB, tableName, retentionDays);
                rowsDeleted = result.rowsDeleted;
                await this._ctx.storage.put(lastPrunedKey, now);
            } catch (e) {
                outcome = 'failure';
            } finally {
                const durationMs = Date.now() - startTime;
                sendDataPruningMetric(this._env, tableName, outcome, rowsDeleted, durationMs);
                this._ctx.waitUntil(updatePruningSummary(this._env.LOGDO_STATE, tableName, rowsDeleted, durationMs));
            }
        }
    }

    /** @returns {Promise<void>} */
    async alarm() {
        const doId = this._ctx.id.toString();
        const colo = this._env.colo || 'unknown';
        this._ctx.waitUntil(updateBatcherState(this._env.LOGDO_STATE, doId, this._batches));
        this._ctx.waitUntil(registerActiveDO(this._env.LOGDO_STATE, doId, colo));

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
     * @private
     * @param {CompiledLogRoute} route
     * @returns {Promise<void>}
     */
    async _writeBatchToD1(route) {
        const {tableName, schema} = route;
        const batchToWrite = this._batches.get(tableName);
        if (!batchToWrite || batchToWrite.length === 0) {
            return;
        }

        await this.initialize(route);
        this._batches.set(tableName, []);

        const startTime = Date.now();
        let outcome = 'success';
        try {
            const columns = Object.keys(schema);
            const placeholders = columns.map((_, i) => `?${i + 1}`).join(', ');

            const stmts = batchToWrite.map(log => {
                const values = columns.map(col => log[col] !== undefined ? log[col] : null);
                return this._env.LOGGING_DB.prepare(
                    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
                ).bind(...values);
            });

            await this._env.LOGGING_DB.batch(stmts);
            console.log(`[DO BATCHER] Successfully wrote batch of ${batchToWrite.length} logs to "${tableName}".`);

            if (tableName === this._env.LOG_HOSE_TABLE) {
                this._ctx.waitUntil(saveLastFirehoseBatch(this._env.LOGDO_STATE, batchToWrite));
                if (batchToWrite.length > 0) {
                    this._ctx.waitUntil(saveLastFirehoseEvent(this._env.LOGDO_STATE, batchToWrite[batchToWrite.length - 1]));
                }
            }

        } catch (e) {
            outcome = 'failure';
            console.error(`[DO BATCHER] D1 batch write to "${tableName}" failed:`, e);
            this._ctx.waitUntil(saveFailedBatch(this._env.LOGDO_STATE, tableName, e, batchToWrite));
            const existingBatch = this._batches.get(tableName) || [];
            this._batches.set(tableName, [...batchToWrite, ...existingBatch]);
        } finally {
            const durationMs = Date.now() - startTime;
            sendBatchWriteMetric(this._env, tableName, outcome, batchToWrite.length, durationMs);
        }
    }
}