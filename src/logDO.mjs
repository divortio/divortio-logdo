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
 * @const {number} BATCH_INTERVAL_MS - The maximum time (in milliseconds) a batch will
 * be held in memory before being written to the database. This acts as a fallback
 * to ensure logs are written even during periods of low traffic.
 */
const BATCH_INTERVAL_MS = 10 * 1000; // 10 seconds

/**
 * @const {number} MAX_BATCH_SIZE - The maximum number of log entries to hold in a
 * single batch. When this limit is reached, the batch is immediately written to D1,
 * regardless of the time interval.
 */
const MAX_BATCH_SIZE = 200;

/**
 * A Durable Object class responsible for batching log data and writing it to D1.
 * Each instance of this class represents a unique shard, determined by factors like
 * colo and server ID, to distribute the write load.
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
     * The Worker's environment bindings, including the D1 database.
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
     * Creates an instance of the LogBatcher.
     * @param {DurableObjectState} ctx - The state and storage context provided by the Cloudflare runtime.
     * @param {object} env - The environment bindings provided by the Cloudflare runtime.
     */
    constructor(ctx, env) {
        super(ctx, env);
        this._ctx = ctx;
        this._env = env;
        this._batch = [];
    }

    /**
     * The main entry point for the Durable Object. It receives log data via a POST request,
     * adds it to the current batch, and triggers a write if the batch is full.
     * @param {Request} request - The incoming request, expected to have a JSON body containing a single log entry.
     * @returns {Promise<Response>} A 202 Accepted response to indicate the log has been received.
     */
    async fetch(request) {
        try {
            const logData = await request.json();
            this._batch.push(logData);

            // Set an alarm to ensure the batch is written even if it doesn't fill up.
            // This prevents data loss during periods of low traffic.
            await this._ctx.storage.setAlarm(Date.now() + BATCH_INTERVAL_MS);

            if (this._batch.length >= MAX_BATCH_SIZE) {
                // The batch is full, so write it to D1 immediately.
                await this._writeBatchToD1();
            }

        } catch (e) {
            console.error("[DO BATCHER] Fetch error:", e);
        }
        return new Response(null, {status: 202}); // Accepted
    }

    /**
     * The alarm handler, triggered by `setAlarm()`. This method is called by the runtime
     * when the BATCH_INTERVAL_MS has elapsed, ensuring that any pending logs are written.
     * @returns {Promise<void>}
     */
    async alarm() {
        await this._writeBatchToD1();
    }

    /**
     * Writes the current in-memory batch to the D1 database. This method prepares a
     * single `d1.batch()` operation for maximum efficiency.
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
                `INSERT INTO
                     requestlogs (logid, rayid, fpid, devicehash, sessionhash, tlshash, serverid,
                                  requesttime, receivedat, processedat, queuetime, processingdurationms, clienttcprtt,
                                  sessionbin10, sessionbin100,
                                  requesturl, requestmethod, requestheaders, requestbody, requestmimetype,
                                  urldomain, urlpath, urlquery,
                                  headerbytes, bodybytes, bodytruncated, clientip, clientdevicetype, clientcookies,
                                  cid, sid, eid,
                                  cfasn, cfasorganization, cfbotmanagement, cfclientacceptencoding, cfcolo, cfcountry,
                                  cfcity, cfcontinent, cfhttpprotocol, cflatitude, cflongitude, cfpostalcode,
                                  cfregion, cfregioncode, cftimezone, cftlscipher, cftlsversion, cftlsclientauth,
                                  geoid,
                                  threatscore, threatcategory, ja3hash, verifiedbot, wafscore, edgeserverip,
                                  edgeserverport, clientport, zonename, workerenv, data)
                     VALUES
                     (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
                      ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38,
                      ?39, ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50, ?51, ?52, ?53, ?54, ?55, ?56,
                      ?57, ?58, ?59, ?60, ?61, ?62, ?63, ?64)`)
                .bind(
                    log.logId, log.rayId, log.fpID, log.deviceHash, log.sessionHash, log.tlsHash, log.serverId,
                    log.requestTime, log.receivedAt, log.processedAt, log.queueTime, log.processingDurationMs, log.clientTcpRtt,
                    log.sessionBin10, log.sessionBin100,
                    log.requestUrl, log.requestMethod, log.requestHeaders, log.requestBody, log.requestMimeType,
                    log.urlDomain, log.urlPath, log.urlQuery,
                    log.headerBytes, log.bodyBytes, log.bodyTruncated, log.clientIp, log.clientDeviceType, log.clientCookies,
                    log.cId, log.sId, log.eId,
                    log.cfAsn, log.cfAsOrganization, log.cfBotManagement, log.cfClientAcceptEncoding, log.cfColo, log.cfCountry,
                    log.cfCity, log.cfContinent, log.cfHttpProtocol, log.cfLatitude, log.cfLongitude, log.cfPostalCode,
                    log.cfRegion, log.cfRegionCode, log.cfTimezone, log.cfTlsCipher, log.cfTlsVersion, log.cfTlsClientAuth,
                    log.geoId,
                    log.threatScore, log.threatCategory, log.ja3Hash, log.verifiedBot, log.wafScore, log.edgeServerIp,
                    log.edgeServerPort, log.clientPort, log.zoneName, log.workerEnv, log.data
                )
            );
            await d1.batch(stmts);
            console.log(`[DO BATCHER] Successfully wrote batch of ${batchToWrite.length} logs.`);
        } catch (e) {
            console.error("[DO BATCHER] D1 batch write failed:", e);
            // A simple but effective retry mechanism: if the batch fails, add it back to the
            // front of the queue to be attempted on the next alarm or fetch.
            this._batch.unshift(...batchToWrite);
        }
    }
}
