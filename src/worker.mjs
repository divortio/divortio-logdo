/**
 * @file src/worker.mjs
 * @description Main entry point for the Divortio D1 Logger. This module defines a
 * class that extends WorkerEntrypoint to act as a modern RPC server, exposing
 * methods that can be called securely by other Cloudflare Workers using Service Bindings.
 * @module WorkerEntrypoint
 */

import {WorkerEntrypoint} from 'cloudflare:workers';
import {logRequest, createLogData} from './logger.mjs';

/**
 * The main class for the logging worker, acting as an RPC server.
 * Other workers can call the public methods defined on this class (e.g., `log`, `getLogData`)
 * via a service binding.
 *
 * @class
 * @extends WorkerEntrypoint
 */
export default class extends WorkerEntrypoint {
    /**
     * The execution context of the worker.
     * @private
     * @type {ExecutionContext}
     */
    _ctx;

    /**
     * The worker's environment bindings.
     * @private
     * @type {object}
     */
    _env;

    /**
     * Creates an instance of the logging worker entrypoint.
     *
     * @param {ExecutionContext} ctx The execution context provided by the Cloudflare runtime.
     * @param {object} env The environment bindings provided by the Cloudflare runtime.
     */
    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
    }

    /**
     * The standard HTTP fetch handler. Since this worker is intended for RPC calls only,
     * any direct HTTP or browser requests will receive an informational error response.
     *
     * @returns {Response} A 405 Method Not Allowed response.
     */
    fetch() {
        return new Response('This worker is an RPC service and is not meant to be accessed directly via HTTP.', {
            status: 405, // Method Not Allowed
        });
    }

    /**
     * [RPC Method] Logs a request in a non-blocking, "fire-and-forget" manner.
     * This is the primary method intended to be called by other workers.
     *
     * @param {Request} request The original request object to be logged.
     * @param {object} [data] Optional. An arbitrary JSON-serializable object for custom application data.
     */
    log(request, data) {
        logRequest(request, data, this._env, this._ctx);
    }

    /**
     * [RPC Method] Retrieves the compiled log data for a given request without
     * actually logging it. Useful for debugging or inspection.
     *
     * @param {Request} request The request object to analyze.
     * @param {object} [data] Optional. An arbitrary JSON-serializable object for custom application data.
     * @returns {Promise<object>} A promise that resolves with the complete log data object.
     */
    async getLogData(request, data) {
        return await createLogData(request, data, this._env);
    }
}

// We must also export the Durable Object class from the main worker module so that
// Cloudflare's runtime knows how to instantiate it when it's called.
export {LogBatcher} from './logDO.mjs';