/**
 * @file src/worker.mjs
 * @description Main entry point for the Divortio D1 Logger. This worker exposes an RPC
 * service for other workers to send log data. It manages the compilation of the log
 * plan and dispatches logging and pruning tasks to the LogBatcher Durable Object.
 * It also provides a standard HTTP fetch handler for non-RPC clients.
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
 * @property {DurableObjectNamespace<LogBatcher>} LOG_BATCHER
 * @property {D1Database} LOGGING_DB
 * @property {KVNamespace} LOGDO_STATE
 * @property {KVNamespace} LOGDO_DEAD_LETTER
 * @property {AnalyticsEngineDataset} METRICS_BATCH_WRITES
 * @property {AnalyticsEngineDataset} METRICS_SCHEMA_MIGRATIONS
 * @property {AnalyticsEngineDataset} METRICS_DATA_PRUNING
 * @property {string} [LOG_HOSE_TABLE]
 * @property {string} [LOG_HOSE_FILTERS]
 * @property {number} [LOG_HOSE_RETENTION_DAYS]
 * @property {number} [LOG_HOSE_PRUNING_INTERVAL_DAYS]
 * @property {number | string} [BATCH_INTERVAL_MS]
 * @property {number | string} [MAX_BATCH_SIZE]
 * @property {number} [MAX_BODY_SIZE]
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
     * The main fetch handler. It is designed to be called from another worker via a
     * service binding. It accepts the forwarded request, logs it, and returns
     * the generated log data as a JSON response.
     * @param {Request} request The original request forwarded from the parent worker.
     * @returns {Promise<Response>}
     */
    async fetch(request) {
        // The request object here IS the original request from the parent worker.
        // We log it asynchronously in the background.
        this.log(request);

        // We then generate the exact same log data to return synchronously to the caller.
        const logData = await this.getLogData(request);

        return new Response(JSON.stringify(logData, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
    }


    /**
     * [RPC Method] The primary fire-and-forget logging method.
     * @param {Request} request - The incoming request object from the calling worker.
     * @param {object} [data] - Optional, arbitrary JSON-serializable data.
     * @returns {Promise<void>}
     */
    async log(request, data) {
        const logPlan = await this._logPlanPromise;
        logRequest(request, data, this._env, this._ctx, logPlan);
    }

    /**
     * [RPC Method] Constructs and returns the full log data object.
     * @param {Request} request - The incoming request object.
     * @param {object} [data] - Optional custom data.
     * @returns {Promise<object>} A promise that resolves with the complete log data object.
     */
    async getLogData(request, data) {
        return await createLogData(request, data, this._env);
    }

    /**
     * The handler for scheduled (cron) events.
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