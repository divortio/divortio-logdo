/**
 * @file src/index.mjs (Example Parent Worker)
 * @description This is an example of a parent Cloudflare Worker that uses the
 * divortio-logdo logging service via a service binding.
 */

/**
 * @typedef {object} LoggerService
 * @property {(request: Request, data?: object) => void} log - The fire-and-forget logging method.
 * @property {(request: Request, data?: object) => Promise<object>} getLogData - A method to get log data for debugging.
 */

/**
 * @typedef {object} Env
 * @property {LoggerService} LOGGER - The service binding for our logging worker.
 * @property {any} ...otherBindings - Your other worker bindings (KV, R2, etc.).
 */

export default {
    /**
     * The main fetch handler for the application worker.
     * @param {Request} request The incoming request.
     * @param {Env} env The environment bindings.
     * @param {ExecutionContext} ctx The execution context.
     * @returns {Promise<Response>}
     */
    async fetch(request, env, ctx) {

        // --- Example 1: Basic Fire-and-Forget Logging ---
        // This is the most common use case. The log is sent to the logging service,
        // and your worker immediately continues without waiting for a response.
        env.LOGGER.log(request);

        // --- Example 2: Logging with Custom Data ---
        // You can pass a second argument to `log()` with any JSON-serializable
        // object. This is useful for adding application-specific context to your logs.
        const customData = {
            userId: "user-12345",
            transactionId: "txn_abc_xyz_789",
            abTestGroup: "B",
            cacheStatus: "HIT"
        };
        env.LOGGER.log(request, customData);

        // --- Example 3: Debugging with getLogData ---
        // If you need to inspect what the log object would look like without
        // actually sending it to the database, you can use `getLogData`.
        // This method is asynchronous and returns the log object.
        if (new URL(request.url).pathname === '/debug-log') {
            const debugLogData = await env.LOGGER.getLogData(request, {isDebug: true});
            return new Response(JSON.stringify(debugLogData, null, 2), {
                headers: {'Content-Type': 'application/json'},
            });
        }

        // Your application's main logic continues here...
        const responseMessage = "Hello from the main application worker!";
        return new Response(responseMessage);
    }
};