/**
 * @file src/worker.mjs
 * @description Main entry point for the Divortio D1 Logger. This worker exposes an RPC
 * service for other workers to send log data. It manages the compilation of the log
 * plan and dispatches logging and pruning tasks to the LogBatcher Durable Object.
 * @module WorkerEntrypoint
 */

import {WorkerEntrypoint} from 'cloudflare:workers';
import {logRequest, createLogData} from './logger.mjs';
import {compileLogPlan} from './filter/logPlanManager.mjs';

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
 * @property {number} [BATCH_INTERVAL_MS] - The interval for batching logs in the DO.
 * @property {number} [MAX_BATCH_SIZE] - The maximum size of a log batch in the DO.
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

    /**
     * The main fetch handler. This worker is an RPC service and is not intended to be
     * accessed directly via HTTP. It will return a 405 Method Not Allowed error.
     * @returns {Response}
     */
    fetch() {
        return new Response('This worker is an RPC service and is not meant to be accessed directly via HTTP.', {
            status: 405,
        });
    }

    /**
     * [RPC Method] The primary fire-and-forget logging method. It determines which
     * log routes the request matches and sends the data to a Durable Object.
     * @param {Request} request - The incoming request object from the calling worker.
     * @param {object} [data] - Optional, arbitrary JSON-serializable data to include in the log.
     * @returns {Promise<void>}
     */
    async log(request, data) {
        const logPlan = await this._logPlanPromise;
        logRequest(request, data, this._env, this._ctx, logPlan);
    }

    /**
     * [RPC Method] A debugging method that constructs and returns the full log data object
     * without actually writing it to the database.
     * @param {Request} request - The incoming request object.
     * @param {object} [data] - Optional custom data.
     * @returns {Promise<object>} A promise that resolves with the complete log data object.
     */
    async getLogData(request, data) {
        return await createLogData(request, data, this._env);
    }

    /**
     * The handler for scheduled (cron) events. This method initiates data retention
     * and pruning checks for all configured log routes.
     * @param {ScheduledController} controller - The controller for the scheduled event.
     * @param {Env} env - The worker's environment bindings.
     * @param {ExecutionContext} ctx - The execution context.
     * @returns {Promise<void>}
     */
    async scheduled(controller, env, ctx) {
        console.log('[Cron Dispatcher] Scheduled pruning check initiated.');
        const logPlan = await this._logPlanPromise;

        for (const route of logPlan) {
            if (route.retentionDays && route.pruningIntervalDays) {
                const doName = `pruner_${route.tableName}`;
                const stub = env.LOG_BATCHER.getByName(doName);

                // **RACE CONDITION FIX**: Ensure the `setLogPlan` RPC call completes before
                // the `runRetentionCheck` call is made. This guarantees the DO has the
                // necessary configuration before it begins the pruning process.
                const promise = stub.setLogPlan(logPlan)
                    .then(() => stub.runRetentionCheck(route))
                    .catch(err => {
                        console.error(`[Cron Dispatcher] Error during scheduled task for table "${route.tableName}":`, err);
                    });

                ctx.waitUntil(promise);
            }
        }
    }
}

export {LogBatcher} from './logDO.mjs';