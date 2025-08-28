/**
 * @file src/logger.mjs
 * @description This module is the core of the logging system. It handles the creation of
 * detailed, structured log objects from incoming requests and forwards them to a
 * Durable Object for batch processing and storage.
 * @module logger
 */

import {pushID} from './lib/pushID/pushID.js';
import {crc32} from './lib/crc32.js';

/**
 * Parses the 'cookie' header from a request into a key-value object.
 *
 * @private
 * @param {Request} request The incoming request object.
 * @returns {Object<string, string>} A key-value map of the parsed cookies.
 */
function parseCookies(request) {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return {};
    const cookies = {};
    cookieHeader.split(';').forEach(c => {
        const [key, ...value] = c.split('=');
        if (key) cookies[key.trim()] = value.join('=').trim();
    });
    return cookies;
}

/**
 * Determines the client's device type ('mobile', 'tablet', 'desktop') based on the User-Agent string.
 *
 * @private
 * @param {string | null} userAgent The User-Agent header string from the request.
 * @returns {string | null} The determined device type or null if the User-Agent is not present.
 */
function getDeviceType(userAgent) {
    if (!userAgent) return null;
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.match(/(?:phone|windows\s+phone|ipod|blackberry|(?:android|bb\d+|meego|silk|googlebot).+?mobile|palm|windows\s+ce|opera\smini|avantgo|mobilesafari|docomo|kaios)/)) {
        return 'mobile';
    }
    if (ua.includes('tablet') || ua.match(/(?:ipad|playbook|(?:android|bb\d+|meego|silk)(?!.+?mobile))/)) {
        return 'tablet';
    }
    return 'desktop';
}

/**
 * Extracts, derives, and organizes all relevant data points from the request and Cloudflare properties.
 * This function is responsible for creating various hashes and identifiers for analytics.
 *
 * @private
 * @param {Request} request The incoming request object.
 * @returns {object} A structured object containing all extracted and derived data points.
 */
function extractLogDataSources(request) {
    const cf = request.cf || {};
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const clientIp = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip');

    const ja3Hash = cf.botManagement?.ja3Hash || null;
    const tlsCipher = cf.tlsCipher || null;
    const tlsClientRandom = cf.tlsClientRandom || null;
    const cookies = parseCookies(request);

    const tlsHash = String(crc32((ja3Hash || '') + (tlsCipher || '') + (tlsClientRandom || '')));
    const deviceHash = String(crc32(userAgent + (ja3Hash || '') + (tlsCipher || '')));
    const connectionHash = String(crc32((clientIp || '') + userAgent + (ja3Hash || '') + (tlsCipher || '')));
    const fpID = cookies['_ss_fpID'] || null;
    const geoId = [cf.continent, cf.country, cf.regionCode, cf.city, cf.postalCode].filter(Boolean).join('-') || null;

    const longHash = String(crc32(connectionHash));
    const sample10 = parseInt(longHash.slice(-1), 10);
    const sample100 = parseInt(longHash.slice(-2), 10);

    return {
        cf, url, clientIp, fpID, deviceHash, connectionHash, tlsHash,
        geoId, cookies, sample10, sample100, clientDeviceType: getDeviceType(userAgent),
    };
}

/**
 * Safely extracts the request body as a string, respecting a configurable maximum size limit.
 *
 * @private
 * @param {Request} request The incoming request object.
 * @param {object} env The worker's environment bindings, containing MAX_BODY_SIZE.
 * @returns {Promise<{body: string|null, bodyBytes: number, bodyTruncated: boolean}>} An object with the body, its size, and truncation status.
 */
async function extractBody(request, env) {
    let body = null, bodyBytes = 0, bodyTruncated = false;
    const MAX_BODY_SIZE = env.MAX_BODY_SIZE || 10240;
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
        const rawBody = await request.clone().text();
        if (rawBody) {
            bodyBytes = new TextEncoder().encode(rawBody).length;
            bodyTruncated = rawBody.length > MAX_BODY_SIZE;
            body = bodyTruncated ? rawBody.substring(0, MAX_BODY_SIZE) : rawBody;
        }
    }
    return {body, bodyBytes, bodyTruncated};
}

/**
 * The primary "fire-and-forget" logging function. It orchestrates the log creation
 * and forwarding process in a non-blocking way using `ctx.waitUntil`.
 *
 * @param {Request} request The incoming request to be logged.
 * @param {object} [customData] Optional, arbitrary JSON-serializable data to be included in the log.
 * @param {object} env The Worker's environment bindings.
 * @param {ExecutionContext} ctx The execution context of the request.
 */
export function logRequest(request, customData, env, ctx) {
    ctx.waitUntil(doLog(request, customData, env));
}

/**
 * An internal async function that performs the core logging logic: creating the log data
 * and sending it to the appropriate Durable Object shard.
 *
 * @private
 * @param {Request} request The incoming request.
 * @param {object} [customData] Optional custom data.
 * @param {object} env The Worker's environment bindings.
 * @returns {Promise<void>}
 */
async function doLog(request, customData, env) {
    try {
        const logData = await createLogData(request, customData, env);
        const colo = logData.cfColo || 'UNKNOWN';
        const timeBucket = Math.floor(Date.now() / (1000 * 60));
        const shardId = `${colo}-${timeBucket}`;
        const doId = env.LOG_BATCHER.idFromName(shardId);
        const stub = env.LOG_BATCHER.get(doId);
        stub.fetch("https://logger/log", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(logData),
        });
    } catch (e) {
        console.error("[LOGGING] Fatal error in doLog:", e);
    }
}

/**
 * Gathers all data from the request, environment, and derived sources into a single,
 * structured log object ready for storage. This is the main data assembly function.
 *
 * @param {Request} request The incoming request.
 * @param {object} [customData] Optional custom data.
 * @param {object} env The Worker's environment bindings.
 * @returns {Promise<object>} A promise that resolves with the complete log data object.
 */
export async function createLogData(request, customData, env) {
    const workerStartTime = Date.now();
    const sources = extractLogDataSources(request);
    const {body, bodyBytes, bodyTruncated} = await extractBody(request, env);

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
        fpID: sources.fpID,
        deviceHash: sources.deviceHash,
        connectionHash: sources.connectionHash,
        tlsHash: sources.tlsHash,
        requestTime: workerStartTime,
        receivedAt: new Date(workerStartTime).toISOString(),
        processedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - workerStartTime,
        clientTcpRtt: sources.cf.clientTcpRtt || null,
        sample10: sources.sample10,
        sample100: sources.sample100,
        requestUrl: request.url,
        requestMethod: request.method,
        requestHeaders: JSON.stringify(headersObject),
        requestBody: body,
        requestMimeType: request.headers.get('content-type') || null,
        urlDomain: sources.url.hostname,
        urlPath: sources.url.pathname,
        urlQuery: sources.url.search,
        headerBytes: JSON.stringify(headersObject).length,
        bodyBytes,
        bodyTruncated,
        clientIp: sources.clientIp || null,
        clientDeviceType: sources.clientDeviceType,
        clientCookies: JSON.stringify(sources.cookies),
        cId: sources.cookies['_ss_cID'] || null,
        sId: sources.cookies['_ss_sID'] || null,
        eId: sources.cookies['_ss_eID'] || null,
        cfAsn: sources.cf.asn || null,
        cfAsOrganization: sources.cf.asOrganization || null,
        cfBotManagement: sources.cf.botManagement ? JSON.stringify(sources.cf.botManagement) : null,
        cfClientAcceptEncoding: sources.cf.clientAcceptEncoding || null,
        cfColo: sources.cf.colo || null,
        cfCountry: sources.cf.country || null,
        cfCity: sources.cf.city || null,
        cfContinent: sources.cf.continent || null,
        cfHttpProtocol: sources.cf.httpProtocol || null,
        cfLatitude: sources.cf.latitude || null,
        cfLongitude: sources.cf.longitude || null,
        cfPostalCode: sources.cf.postalCode || null,
        cfRegion: sources.cf.region || null,
        cfRegionCode: sources.cf.regionCode || null,
        cfTimezone: sources.cf.timezone || null,
        cfTlsCipher: sources.cf.tlsCipher || null,
        cfTlsVersion: sources.cf.tlsVersion || null,
        cfTlsClientAuth: sources.cf.tlsClientAuth ? JSON.stringify(sources.cf.tlsClientAuth) : null,
        geoId: sources.geoId,
        threatScore: sources.cf.threatScore || null,
        ja3Hash: sources.cf.botManagement?.ja3Hash || null,
        verifiedBot: sources.cf.botManagement?.verifiedBot ?? null,
        workerEnv: JSON.stringify(sanitizedEnv),
        data: serializedCustomData,
    };
}