/**
 * @file src/index.js
 * @description Main entry point for the Divortio D1 Logger.
 * This class extends WorkerEntrypoint to act as a modern RPC server,
 * exposing methods to be called securely by other workers.
 */

import {WorkerEntrypoint} from 'cloudflare:workers';
import {logRequest, createLogData} from './logger.mjs';

export default class extends WorkerEntrypoint {

    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
    }

    /**
     * The standard HTTP fetch handler. Since this worker is intended for RPC calls only,
     * direct HTTP requests will receive a simple informational response.
     * @returns {Response}
     */
    fetch() {
        return new Response('This worker is an RPC service and is not meant to be accessed directly via HTTP.', {
            status: 405, // Method Not Allowed
        });
    }

    /**
     * RPC Method: Logs a request without blocking.
     * @param {Request} request The request object to be logged.
     * @param {object} [data] Optional. An arbitrary JSON object for custom application data.
     */
    log(request, data) {
        logRequest(request, data, this._env, this._ctx);
    }

    /**
     * RPC Method: Retrieves the compiled log data for a given request.
     * @param {Request} request The request object to analyze.
     * @param {object} [data] Optional. An arbitrary JSON object for custom application data.
     * @returns {Promise<object>} A promise that resolves with the complete log data object.
     */
    async getLogData(request, data) {
        return await createLogData(request, data, this._env);
    }
}

// We must also export the Durable Object class from the main module so that
// Cloudflare knows how to instantiate it.
export {LogBatcher} from './logDO.mjs';