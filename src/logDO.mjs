/**
 * @file src/logDO.mjs
 * @description This file defines the LogBatcher Durable Object. Its sole responsibility
 * is to receive individual log entries, batch them in memory, and write them to a
 * D1 database in bulk. This batching strategy is crucial for high-throughput logging
 * and minimizing D1 write operations.
 * @module LogBatcher
 */

import {DurableObject} from "cloudflare:workers";

/**
 * A Durable Object class responsible for batching log data and writing it to D1.
 * Each instance of this class represents a unique shard, determined by factors like
 * colo and time, to distribute the write load.
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
     * The Worker's environment bindings, including the D1 database and configuration variables.
     * @private
     * @type {object}
     */
    _env;

    /**
     * An in-memory array to store the current batch of log entries.
     * @private
     * @type {Array<object>}
     */
    _batch;

    /**
     * The maximum time (in milliseconds) a batch will be held before being written.
     * @private
     * @type {number}
     */
    _batchIntervalMs;

    /**
     * The maximum number of log entries to hold in a single batch.
     * @private
     * @type {number}
     */
    _maxBatchSize;

    /**
     * Creates an instance of the LogBatcher. It initializes its state and configuration
     * from the environment variables defined in `wrangler.toml`.
     *
     * @param {DurableObjectState} ctx The state and storage context provided by the Cloudflare runtime.
     * @param {object} env The environment bindings provided by the Cloudflare runtime.
     */
    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
        this._batch = [];

        // Access batching configuration from the environment with sensible fallbacks.
        this._batchIntervalMs = this._env.BATCH_INTERVAL_MS || 10000; // Default to 10 seconds
        this._maxBatchSize = this._env.MAX_BATCH_SIZE || 200;      // Default to 200 logs
    }

    /**
     * The main entry point for the Durable Object. It receives log data via a POST request,
     * adds it to the current batch, and triggers a write if the batch is full.
     *
     * @param {Request} request The incoming request, expected to have a JSON body containing a single log entry.
     * @returns {Promise<Response>} A 202 Accepted response to indicate the log has been received for processing.
     */
    async fetch(request) {
        try {
            const logData = await request.json();
            this._batch.push(logData);

            // Set an alarm to ensure the batch is written even if it doesn't fill up.
            await this._ctx.storage.setAlarm(Date.now() + this._batchIntervalMs);

            if (this._batch.length >= this._maxBatchSize) {
                await this._writeBatchToD1();
            }
        } catch (e) {
            console.error("[DO BATCHER] Fetch error:", e);
        }
        return new Response(null, {status: 202}); // Accepted
    }

    /**
     * The alarm handler, triggered by `setAlarm()`. This method is called by the runtime
     * when the configured `BATCH_INTERVAL_MS` has elapsed, ensuring that any pending logs are written.
     * @returns {Promise<void>}
     */
    async alarm() {
        await this._writeBatchToD1();
    }

    /**
     * Writes the current in-memory batch to the D1 database. This method prepares a
     * single `d1.batch()` operation for maximum efficiency and includes a simple retry mechanism.
     *
     * @private
     * @returns {Promise<void>}
     */
    async _writeBatchToD1() {
        if (this._batch.length === 0) {
            return;
        }

        const d1 = this._env.LOGGING_DB;
        const batchToWrite = this._batch;
        this._batch = []; // Clear the batch immediately to prevent duplicate writes.

        try {
            const stmts = batchToWrite.map(log => d1.prepare(
                `INSERT INTO requestlogs (
                    logId, rayId, fpID, deviceHash, connectionHash, tlsHash,
                    requestTime, receivedAt, processedAt, processingDurationMs, clientTcpRtt,
                    sample10, sample100,
                    requestUrl, requestMethod, requestHeaders, requestBody, requestMimeType,
                    urlDomain, urlPath, urlQuery,
                    headerBytes, bodyBytes, bodyTruncated, clientIp, clientDeviceType, clientCookies,
                    cId, sId, eId,
                    cfAsn, cfAsOrganization, cfBotManagement, cfClientAcceptEncoding, cfColo, cfCountry,
                    cfCity, cfContinent, cfHttpProtocol, cfLatitude, cfLongitude, cfPostalCode,
                    cfRegion, cfRegionCode, cfTimezone, cfTlsCipher, cfTlsVersion, cfTlsClientAuth,
                    geoId, threatScore, ja3Hash, verifiedBot,
                    workerEnv, data
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                    ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34,
                    ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50,
                    ?51, ?52, ?53, ?54
                )`
            ).bind(
                log.logId, log.rayId, log.fpID, log.deviceHash, log.connectionHash, log.tlsHash,
                log.requestTime, log.receivedAt, log.processedAt, log.processingDurationMs, log.clientTcpRtt,
                log.sample10, log.sample100,
                log.requestUrl, log.requestMethod, log.requestHeaders, log.requestBody, log.requestMimeType,
                log.urlDomain, log.urlPath, log.urlQuery,
                log.headerBytes, log.bodyBytes, log.bodyTruncated, log.clientIp, log.clientDeviceType, log.clientCookies,
                log.cId, log.sId, log.eId,
                log.cfAsn, log.cfAsOrganization, log.cfBotManagement, log.cfClientAcceptEncoding, log.cfColo, log.cfCountry,
                log.cfCity, log.cfContinent, log.cfHttpProtocol, log.cfLatitude, log.cfLongitude, log.cfPostalCode,
                log.cfRegion, log.cfRegionCode, log.cfTimezone, log.cfTlsCipher, log.cfTlsVersion, log.cfTlsClientAuth,
                log.geoId, log.threatScore, log.ja3Hash, log.verifiedBot,
                log.workerEnv, log.data
            ));

            await d1.batch(stmts);
            console.log(`[DO BATCHER] Successfully wrote batch of ${batchToWrite.length} logs.`);
        } catch (e) {
            console.error("[DO BATCHER] D1 batch write failed:", e);
            // If the batch fails, add it back to the front of the queue to be attempted on the next alarm or fetch.
            this._batch.unshift(...batchToWrite);
        }
    }
}