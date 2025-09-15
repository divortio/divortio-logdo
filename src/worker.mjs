/**
 * @file src/worker.mjs
 * @description Main entry point for the Divortio D1 Logger.
 * @module WorkerEntrypoint
 */

import {WorkerEntrypoint} from 'cloudflare:workers';
import {logRequest, createLogData} from './logger.mjs';
import {compileLogPlan} from './filter/logPlanManager.mjs';

// --- JSDoc Type Definitions for IDE ---
/**
 * @typedef {import('./logDO.mjs').LogBatcher} LogBatcher
 * @typedef {import('@cloudflare/workers-types').AnalyticsEngineDataset} AnalyticsEngineDataset
 * @typedef {import('@cloudflare/workers-types').DurableObjectNamespace} DurableObjectNamespace
 * @typedef {import('@cloudflare/workers-types').D1Database} D1Database
 * @typedef {import('@cloudflare/workers-types').KVNamespace} KVNamespace
 * @typedef {import('@cloudflare/workers-types').ExecutionContext} ExecutionContext
 * @typedef {import('@cloudflare/workers-types').Request} Request
 * @typedef {import('@cloudflare/workers-types').Response} Response
 * @typedef {import('@cloudflare/workers-types').ScheduledController} ScheduledController
 * @typedef {import('./filter/logPlanManager.mjs').CompiledLogRoute} CompiledLogRoute
 */

/**
 * @typedef {object} Env
 * @property {DurableObjectNamespace<LogBatcher>} LOG_BATCHER - Binding to the LogBatcher Durable Object.
 * @property {D1Database} LOGGING_DB - Binding to the D1 database.
 * @property {KVNamespace} LOGDO_STATE - Binding to the KV namespace for state snapshots.
 * @property {AnalyticsEngineDataset} METRICS_BATCH_WRITES - WAE dataset for batch write operations.
 * @property {AnalyticsEngineDataset} METRICS_SCHEMA_MIGRATIONS - WAE dataset for schema migration events.
 * @property {AnalyticsEngineDataset} METRICS_DATA_PRUNING - WAE dataset for data pruning operations.
 * @property {string} [LOG_HOSE_TABLE] - The table name for the default firehose.
 * @property {string} [LOG_HOSE_FILTERS] - Optional filters for the default firehose.
 * @property {number} [LOG_HOSE_RETENTION_DAYS] - Optional retention period for the firehose.
 * @property {number} [LOG_HOSE_PRUNING_INTERVAL_DAYS] - Optional pruning interval for the firehose.
 * @property {number} [BATCH_INTERVAL_MS] - The interval for batching logs.
 * @property {number} [MAX_BATCH_SIZE] - The maximum size of a log batch.
 * @property {number} [MAX_BODY_SIZE] - The maximum size of a request body to log.
 */

export default class extends WorkerEntrypoint {
    /** @private @type {ExecutionContext} */
    _ctx;
    /** @private @type {Env} */
    _env;
    /** @private @type {Promise<Array<CompiledLogRoute>>} */
    _logPlanPromise;

    /**
     * @param {ExecutionContext} ctx
     * @param {Env} env
     */
    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
        this._logPlanPromise = compileLogPlan(env);
    }

    /** @returns {Response} */
    fetch() {
        return new Response('This worker is an RPC service and is not meant to be accessed directly via HTTP.', {
            status: 405,
        });
    }

    /**
     * @param {Request} request
     * @param {object} [data]
     * @returns {Promise<void>}
     */
    async log(request, data) {
        const logPlan = await this._logPlanPromise;
        logRequest(request, data, this._env, this._ctx, logPlan);
    }

    /**
     * @param {Request} request
     * @param {object} [data]
     * @returns {Promise<object>}
     */
    async getLogData(request, data) {
        return await createLogData(request, data, this._env);
    }

    /**
     * @param {ScheduledController} controller
     * @param {Env} env
     * @param {ExecutionContext} ctx
     * @returns {Promise<void>}
     */
    async scheduled(controller, env, ctx) {
        console.log('[Cron Dispatcher] Scheduled pruning check initiated.');
        const logPlan = await this._logPlanPromise;

        for (const route of logPlan) {
            if (route.retentionDays && route.pruningIntervalDays) {
                const doName = `pruner_${route.tableName}`;
                const stub = env.LOG_BATCHER.getByName(doName);
                ctx.waitUntil(stub.runRetentionCheck(route));
            }
        }
    }
}

export {LogBatcher} from './logDO.mjs';