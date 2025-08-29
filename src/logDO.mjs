/**
 * @file src/logDO.mjs
 * @description This file defines the LogBatcher Durable Object. It is implemented as a
 * modern RPC service, exposing public methods that can be called by other workers.
 * @module LogBatcher
 */

import {DurableObject} from "cloudflare:workers";

/**
 * A Durable Object class that acts as an RPC service for batching logs.
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
     * An in-memory array to store the current batch of log entries.
     * @private
     * @type {Array<object>}
     */
    _batch;

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
     * Creates an instance of the LogBatcher.
     *
     * @param {DurableObjectState} ctx The state and storage context.
     * @param {object} env The environment bindings.
     */
    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
        this._batch = [];
        this._batchIntervalMs = this._env.BATCH_INTERVAL_MS || 10000;
        this._maxBatchSize = this._env.MAX_BATCH_SIZE || 200;
    }

    /**
     * [RPC Method] Adds a single log entry to the batch.
     * This is the public method called by the main logger worker.
     *
     * @param {object} logData The structured log object to add to the batch.
     * @returns {Promise<void>}
     */
    async addLog(logData) {
        this._batch.push(logData);
        await this._ctx.storage.setAlarm(Date.now() + this._batchIntervalMs);
        if (this._batch.length >= this._maxBatchSize) {
            await this._writeBatchToD1();
        }
    }

    /**
     * The alarm handler, triggered by `setAlarm()`.
     * @returns {Promise<void>}
     */
    async alarm() {
        await this._writeBatchToD1();
    }

    /**
     * Writes the current in-memory batch to the D1 database.
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
        this._batch = [];

        try {
            const stmts = batchToWrite.map(log => d1.prepare(
                `INSERT INTO requestlogs (
                    logId, rayId, fpID, deviceHash, connectionHash, tlsHash,
                    requestTime, receivedAt, processedAt, processingDurationMs, clientTcpRtt,
                    sample10, sample100,
                    requestUrl, requestMethod, requestHeaders, requestBody, requestMimeType,
                    urlDomain, urlPath, urlQuery,
                    headerBytes, bodyBytes, bodyTruncated, clientIp, clientDeviceType, clientCookies,
                    cId, sId, eId, uID, emID, emA,
                    cfAsn, cfAsOrganization, cfBotManagement, cfClientAcceptEncoding, cfColo, cfCountry,
                    cfCity, cfContinent, cfHttpProtocol, cfLatitude, cfLongitude, cfPostalCode,
                    cfRegion, cfRegionCode, cfTimezone, cfTlsCipher, cfTlsVersion, cfTlsClientAuth,
                    geoId, threatScore, ja3Hash, verifiedBot,
                    workerEnv, data
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                    ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34,
                    ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50,
                    ?51, ?52, ?53, ?54, ?55, ?56, ?57
                )`
            ).bind(
                log.logId, log.rayId, log.fpID, log.deviceHash, log.connectionHash, log.tlsHash,
                log.requestTime, log.receivedAt, log.processedAt, log.processingDurationMs, log.clientTcpRtt,
                log.sample10, log.sample100,
                log.requestUrl, log.requestMethod, log.requestHeaders, log.requestBody, log.requestMimeType,
                log.urlDomain, log.urlPath, log.urlQuery,
                log.headerBytes, log.bodyBytes, log.bodyTruncated, log.clientIp, log.clientDeviceType, log.clientCookies,
                log.cId, log.sId, log.eId, log.uID, log.emID, log.emA,
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
            this._batch.unshift(...batchToWrite);
        }
    }
}