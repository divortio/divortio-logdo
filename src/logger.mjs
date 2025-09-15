/**
 * @file src/logger.mjs
 * @description This module is the core of the logging system. It orchestrates the creation of
 * the log data object and routes it to the Durable Object based on the compiled log plan.
 * @module logger
 */

import {pushID} from './lib/pushID/pushID.js';
import {crc32} from './lib/crc32.js';
import {
    parseCookies,
    extractBody,
    getDeviceType,
    calculateHashes,
    buildGeoId
} from './lib/requestUtils.mjs';

/**
 * @typedef {import('@cloudflare/workers-types').ExecutionContext} ExecutionContext
 * @typedef {import('@cloudflare/workers-types').Request} Request
 * @typedef {import('./filter/logPlanManager.mjs').CompiledLogRoute} CompiledLogRoute
 */

/**
 * The primary "fire-and-forget" logging function.
 *
 * @param {Request} request The incoming request to be logged.
 * @param {object} [customData] Optional, arbitrary JSON-serializable data.
 * @param {object} env The Worker's environment bindings.
 * @param {ExecutionContext} ctx The execution context of the request.
 * @param {Array<CompiledLogRoute>} logPlan The pre-compiled log plan from the manager.
 */
export function logRequest(request, customData, env, ctx, logPlan) {
    const matchedRoutes = logPlan.filter(route => route.filter(request));
    if (matchedRoutes.length === 0) {
        return;
    }
    ctx.waitUntil(sendLog(request, customData, env, matchedRoutes));
}

/**
 * An internal async function that assembles the log data and sends it to the Durable Object.
 *
 * @private
 * @param {Request} request The incoming request.
 * @param {object} [customData] Optional custom data.
 * @param {object} env The Worker's environment bindings.
 * @param {Array<CompiledLogRoute>} matchedRoutes The routes this log should be written to.
 * @returns {Promise<void>}
 */
async function sendLog(request, customData, env, matchedRoutes) {
    try {
        const logData = await createLogData(request, customData, env);
        const shardId = request.headers.get('cf-ray') || logData.logId;
        const doName = `batcher_${shardId}`;
        const stub = env.LOG_BATCHER.getByName(doName);
        stub.addLog(logData, matchedRoutes);
    } catch (e) {
        console.error("[LOGGING] Fatal error in sendLog:", e);
    }
}

/**
 * Gathers all data into a single, structured log object ready for storage.
 *
 * @param {Request} request The incoming request.
 * @param {object} [customData] Optional custom data.
 * @param {object} env The Worker's environment bindings.
 * @returns {Promise<object>} A promise that resolves with the complete log data object.
 */
export async function createLogData(request, customData, env) {
    const workerStartTime = Date.now();
    const cf = request.cf || {};
    const url = new URL(request.url);

    const cookies = parseCookies(request);
    const userAgent = request.headers.get('user-agent') || '';
    const clientIp = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || null;

    const {tlsHash, deviceHash, connectionHash} = calculateHashes(request, clientIp, userAgent);
    const geoId = buildGeoId(cf);
    const clientDeviceType = getDeviceType(userAgent);
    const {body, bodyBytes, bodyTruncated} = await extractBody(request, env);

    const longHashForBucketing = String(crc32(connectionHash));
    const sample10 = parseInt(longHashForBucketing.slice(-1), 10);
    const sample100 = parseInt(longHashForBucketing.slice(-2), 10);

    let serializedCustomData = null;
    if (customData) {
        try {
            serializedCustomData = JSON.stringify(customData);
        } catch (e) {
            serializedCustomData = JSON.stringify({error: "Failed to serialize custom data", message: e.message});
        }
    }

    const sanitizedEnv = {};
    for (const key in env) {
        if (typeof env[key] === 'string' || typeof env[key] === 'number' || typeof env[key] === 'boolean') {
            sanitizedEnv[key] = env[key];
        }
    }

    const headersObject = {};
    for (const [key, value] of request.headers.entries()) {
        headersObject[key] = value;
    }

    return {
        logId: pushID.newID({time: workerStartTime}),
        rayId: request.headers.get('cf-ray') || null,
        fpID: cookies['_ss_fpID'] || null,
        deviceHash: deviceHash,
        connectionHash: connectionHash,
        tlsHash: tlsHash,
        requestTime: workerStartTime,
        receivedAt: new Date(workerStartTime).toISOString(),
        processedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - workerStartTime,
        clientTcpRtt: cf.clientTcpRtt || null,
        sample10: sample10,
        sample100: sample100,
        requestUrl: request.url,
        requestMethod: request.method,
        requestHeaders: JSON.stringify(headersObject),
        requestBody: body,
        requestMimeType: request.headers.get('content-type') || null,
        urlDomain: url.hostname,
        urlPath: url.pathname,
        urlQuery: url.search,
        headerBytes: JSON.stringify(headersObject).length,
        bodyBytes,
        bodyTruncated,
        clientIp: clientIp,
        clientDeviceType: clientDeviceType,
        clientCookies: JSON.stringify(cookies),
        cId: cookies['_ss_cID'] || cookies['_cc_cID'] || null,
        sId: cookies['_ss_sID'] || cookies['_cc_sID'] || null,
        eId: cookies['_ss_eID'] || cookies['_cc_eID'] || null,
        uID: cookies['_ss_uID'] || cookies['_cc_uID'] || null,
        emID: cookies['_ss_emID'] || cookies['_cc_emID'] || null,
        emA: cookies['_ss_emA'] || cookies['_cc_emA'] || null,
        cfAsn: cf.asn || null,
        cfAsOrganization: cf.asOrganization || null,
        cfBotManagement: cf.botManagement ? JSON.stringify(cf.botManagement) : null,
        cfClientAcceptEncoding: cf.clientAcceptEncoding || null,
        cfColo: cf.colo || null,
        cfCountry: cf.country || null,
        cfCity: cf.city || null,
        cfContinent: cf.continent || null,
        cfHttpProtocol: cf.httpProtocol || null,
        cfLatitude: cf.latitude || null,
        cfLongitude: cf.longitude || null,
        cfPostalCode: cf.postalCode || null,
        cfRegion: cf.region || null,
        cfRegionCode: cf.regionCode || null,
        cfTimezone: cf.timezone || null,
        cfTlsCipher: cf.tlsCipher || null,
        cfTlsVersion: cf.tlsVersion || null,
        cfTlsClientAuth: cf.tlsClientAuth ? JSON.stringify(cf.tlsClientAuth) : null,
        geoId: geoId,
        threatScore: cf.threatScore || null,
        ja3Hash: cf.botManagement?.ja3Hash || null,
        verifiedBot: cf.botManagement?.verifiedBot ?? null,
        workerEnv: JSON.stringify(sanitizedEnv),
        data: serializedCustomData,
    };
}