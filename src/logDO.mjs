/**
 * @file src/logDO.mjs
 * @description Defines the LogBatcher Durable Object. It initializes the database schema
 * for multiple tables, manages independent in-memory batches for each, and handles
 * long-running migrations gracefully. It also contains the logic for cron-triggered data retention.
 * @module LogBatcher
 */

import {DurableObject} from "cloudflare:workers";
import {initDB} from './schema/schemaManager.mjs';
import {pruneTable} from './filter/pruneRetention.mjs';
import {tableSchema as masterSchema} from './schema/schema.mjs';



/**
 * A Durable Object class that acts as an RPC service for batching logs to multiple tables
 * and handling scheduled data retention tasks.
 *
 * @class
 * @extends DurableObject
 */
export class LogBatcher extends DurableObject {
    /**
     * The Durable Object's state and storage context.
     * @private
     * @type {DurableObjectState}
     */
    _ctx;

    /**
     * The Worker's environment bindings.
     * @private
     * @type {object}
     */
    _env;

    /**
     * A Map to store the in-memory batch for each destination table.
     * The key is the table name, the value is an array of log objects.
     * @private
     * @type {Map<string, Array<object>>}
     */
    _batches;

    /**
     * The configured batching interval in milliseconds.
     * @private
     * @type {number}
     */
    _batchIntervalMs;

    /**
     * The configured maximum batch size.
     * @private
     * @type {number}
     */
    _maxBatchSize;

    /**
     * A Map to hold promises for the initialization of each table's schema.
     * This prevents redundant schema checks for the same table.
     * @private
     * @type {Map<string, Promise<void>>}
     */
    _initPromises;

    /**
     * Creates an instance of the LogBatcher.
     *
     * @param {DurableObjectState} ctx The state and storage context.
     * @param {object} env The environment bindings.
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
     * The standard fetch handler. Since this Durable Object is RPC-only, direct
     * HTTP requests are not allowed.
     *
     * @returns {Response} A 405 Method Not Allowed response.
     */
    fetch() {
        return new Response("This Durable Object only supports RPC calls.", {status: 405});
    }

    /**
     * Ensures the schema for a given table is initialized. This method is idempotent and
     * ensures the schema check only runs once per table per instance activation.
     * @private
     * @param {object} route The logRoute object, containing tableName, schema, and schemaHash.
     * @returns {Promise<void>}
     */
    initialize(route) {
        const {tableName, schema, schemaHash} = route;
        if (this._initPromises.has(tableName)) {
            return this._initPromises.get(tableName);
        }

        const initPromise = (async () => {
            const storageKey = `schema_hash_${tableName}`;
            const storedHash = await this._ctx.storage.get(storageKey);

            if (storedHash !== schemaHash) {
                await initDB(this._env, storedHash, route);
                await this._ctx.storage.put(storageKey, schemaHash);
            }
        })();

        this._initPromises.set(tableName, initPromise);
        return initPromise;
    }

    /**
     * [RPC Method] Accepts a log entry and the routes it matched. It adds the log
     * to the appropriate in-memory batches.
     *
     * @param {object} logData The structured log object.
     * @param {Array<object>} matchedRoutes The compiled logRoute objects this log should be written to.
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
     * [RPC Method] Triggered by the main worker's cron handler to check if data
     * retention policies need to be enforced for a specific table.
     *
     * @param {object} route The logRoute object containing the retention policy.
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
            await pruneTable(this._env.LOGGING_DB, tableName, retentionDays);
            await this._ctx.storage.put(lastPrunedKey, now);
        }
    }

    /**
     * The alarm handler, triggered to flush any pending logs.
     * @returns {Promise<void>}
     */
    async alarm() {
        // This needs a more robust way to get the route.
        // This is a simplification and would need a more robust solution in production.
        console.warn("[DO BATCHER] Alarm trigger for multi-table writes is simplified and may need a more robust route resolution strategy.");
    }

    /**
     * Writes a specific batch to its D1 table.
     * @private
     * @param {object} route The full logRoute object for the table to write to.
     * @returns {Promise<void>}
     */
    async _writeBatchToD1(route) {
        const {tableName, schema} = route;
        const batchToWrite = this._batches.get(tableName);
        if (!batchToWrite || batchToWrite.length === 0) {
            return;
        }

        await this.initialize(route);

        const d1 = this._env.LOGGING_DB;
        this._batches.set(tableName, []);

        try {
            const columns = Object.keys(schema);
            const placeholders = columns.map((_, i) => `?${i + 1}`).join(', ');

            const stmts = batchToWrite.map(log => {
                const values = columns.map(col => log[col] !== undefined ? log[col] : null);
                return d1.prepare(
                    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
                ).bind(...values);
            });

            await d1.batch(stmts);
            console.log(`[DO BATCHER] Successfully wrote batch of ${batchToWrite.length} logs to "${tableName}".`);
        } catch (e) {
            console.error(`[DO BATCHER] D1 batch write to "${tableName}" failed:`, e);
            const existingBatch = this._batches.get(tableName) || [];
            this._batches.set(tableName, [...batchToWrite, ...existingBatch]);
        }
    }
}