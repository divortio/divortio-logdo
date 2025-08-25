/**
 * @file src/logger.mjs
 * @description This module is the core of the logging system. It handles the creation of
 * detailed, structured log objects from incoming requests and forwards them to a
 * Durable Object for batch processing and storage. It is designed to be highly
 * resilient, with fallbacks for data enrichment.
 * @module logger
 */

import {pushID} from './lib/pushID/pushID.js';
import {createBrowserFingerprint} from './lib/fingerprint.js';
import {crc32} from './lib/crc32.js';

// --- Helper Functions for Data Extraction ---

/**
 * A robust getter function that prioritizes a value from the Cloudflare `cf` object,
 * falls back to a corresponding request header, and returns null if neither is available.
 * This ensures that the most reliable data source is always used.
 * @private
 * @param {object} cf - The Cloudflare `cf` object from the request.
 * @param {Headers} headers - The map of lowercased request headers.
 * @param {string} cfKey - The key for the desired property on the `cf` object (e.g., 'tlsCipher').
 * @param {string|null} headerKey - The key for the fallback header (e.g., 'x-cf-tls-cipher').
 * @param {string} [nestedCfKey=null] - An optional nested key for accessing properties within objects like `botManagement`.
 * @returns {string|boolean|number|null} The found value, or null if the value is not present or is an empty string.
 */
function getValue(cf, headers, cfKey, headerKey, nestedCfKey = null) {
    let cfValue = nestedCfKey ? cf[nestedCfKey]?.[cfKey] : cf[cfKey];
    if (cfValue !== undefined && cfValue !== null && cfValue !== '') {
        return cfValue;
    }
    return headers[headerKey] || null;
}

/**
 * Extracts and organizes all relevant data points from the Cloudflare 'cf' object and request headers.
 * It builds a comprehensive source object that includes derived fingerprints and identifiers,
 * with built-in fallbacks to ensure data is captured even if Transform Rules are not active.
 * @private
 * @param {Request} request - The incoming request object.
 * @param {Headers} headers - A key-value map of lowercased request headers.
 * @returns {object} A structured object containing all extracted and derived data points for logging.
 */
function extractLogDataSources(request, headers) {
    const cf = request.cf || {};
    const url = new URL(request.url);
    const userAgent = headers['user-agent'] || '';
    const clientIp = getValue(cf, headers, 'clientIp', 'x-cf-client-ip') || headers['cf-connecting-ip'] || null;

    // --- Core Identifiers ---
    const ja3Hash = getValue(cf, headers, 'ja3Hash', 'x-cf-ja3-hash', 'botManagement');
    const tlsCipher = getValue(cf, headers, 'tlsCipher', null);
    const tlsClientRandom = getValue(cf, headers, 'tlsClientRandom', null);
    const httpProtocol = getValue(cf, headers, 'httpProtocol', null);
    const colo = getValue(cf, headers, 'colo', 'x-cf-colo');
    const metalId = headers['x-cf-metal-id'] || null;

    // --- Fingerprints & Hashes (derived from core identifiers) ---
    const tlsHash = headers['x-cf-tls-hash'] || String(crc32((ja3Hash || '') + (tlsCipher || '') + (tlsClientRandom || '')));
    const deviceHash = headers['x-cf-device-hash'] || String(crc32(userAgent + (ja3Hash || '') + (tlsCipher || '')));
    const sessionHash = headers['x-cf-session-hash'] || String(crc32((clientIp || '') + userAgent + (ja3Hash || '') + (tlsCipher || '')));
    const serverId = headers['x-cf-server-id'] || (colo && metalId ? colo + metalId : null);

    // --- Geographic, URL & Other Data ---
    const geoId = headers['x-cf-geo-id'] || (cf.continent && cf.country ? `${cf.continent}-${cf.country}-${cf.regionCode}-${cf.city}-${cf.postalCode}` : null);
    const urlDomain = headers['x-url-domain'] || url.hostname;
    const urlPath = headers['x-url-path'] || url.pathname;
    const urlQuery = headers['x-url-query'] || url.search;
    const threatScore = getValue(cf, headers, 'threatScore', 'x-cf-threat-score');
    const verifiedBot = getValue(cf, headers, 'verifiedBot', 'x-cf-verified-bot', 'botManagement');
    const zoneName = getValue(cf, headers, 'zoneName', 'x-cf-zone-name');
    const deviceType = getValue(cf, headers, 'deviceType', 'x-device-type');

    return {
        cf, headers, url, clientIp, ja3Hash, tlsCipher, tlsHash, deviceHash,
        sessionHash, serverId, geoId, urlDomain, urlPath, urlQuery, httpProtocol,
        threatScore: threatScore ? parseInt(String(threatScore), 10) : null,
        verifiedBot: verifiedBot !== null ? (String(verifiedBot).toLowerCase() === 'true') : null,
        zoneName, deviceType
    };
}

/**
 * Parses the 'cookie' header into a key-value object.
 * @private
 * @param {Headers} headers - A key-value map of lowercased request headers.
 * @returns {Object<string, string>} An object containing the parsed cookies.
 */
function parseCookies(headers) {
    const cookies = {};
    if (headers['cookie']) {
        headers['cookie'].split(';').forEach(c => {
            const [key, ...value] = c.split('=');
            if (key) cookies[key.trim()] = value.join('=').trim();
        });
    }
    return cookies;
}

/**
 * Extracts the request body as a string, respecting a maximum size limit.
 * @private
 * @param {Request} request - The incoming request object.
 * @returns {Promise<{body: string|null, bodyBytes: number, bodyTruncated: boolean}>} An object containing the body, its size, and truncation status.
 */
async function extractBody(request) {
    let body = null, bodyBytes = 0, bodyTruncated = false;
    const MAX_BODY_SIZE = 10240;
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

// --- Public API ---

/**
 * The primary "fire-and-forget" logging function exposed by the service.
 * It orchestrates the log creation and forwarding process in a non-blocking way
 * by using `ctx.waitUntil`.
 * @param {Request} request - The incoming request to be logged.
 * @param {object} [customData] - Optional, arbitrary JSON-serializable data to be included in the log.
 * @param {object} env - The Worker's environment bindings.
 * @param {ExecutionContext} ctx - The execution context of the request.
 */
export function logRequest(request, customData, env, ctx) {
    ctx.waitUntil(doLog(request, customData, env));
}

/**
 * An internal async function that performs the core logging logic: creating the log data
 * and sending it to the appropriate Durable Object shard.
 * @private
 * @param {Request} request - The incoming request.
 * @param {object} [customData] - Optional custom data.
 * @param {object} env - The Worker's environment bindings.
 * @returns {Promise<void>}
 */
async function doLog(request, customData, env) {
    try {
        const logData = await createLogData(request, customData, env);
        const colo = logData.cfColo;
        const serverId = logData.serverId;
        const timeBucket = Math.floor(Date.now() / (1000 * 60)); // 1-minute bucket for sharding

        let shardId = serverId
            ? `${colo}-${serverId}-${timeBucket}`
            : `${colo || 'UNKNOWN'}-${timeBucket}`;

        const doId = env.LOG_BATCHER.idFromName(shardId);
        const stub = env.LOG_BATCHER.get(doId);

        // Fire-and-forget the fetch call to the Durable Object.
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
 * @param {Request} request - The incoming request.
 * @param {object} [customData] - Optional custom data.
 * @param {object} env - The Worker's environment bindings.
 * @returns {Promise<object>} A promise that resolves with the complete log data object.
 */
export async function createLogData(request, customData, env) {
    const workerStartTime = Date.now();

    const headers = {};
    for (const [key, value] of request.headers.entries()) {
        headers[key.toLowerCase()] = value;
    }

    // --- 1. Extract all data from primary sources and fallbacks ---
    const sources = extractLogDataSources(request, headers);
    const cookies = parseCookies(headers);
    const {body, bodyBytes, bodyTruncated} = await extractBody(request);

    // --- 2. Sanitize and prepare any remaining data ---
    const edgeRequestTime = parseInt(headers['x-request-time'] || workerStartTime, 10);

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

    // --- 3. Assemble the final log object ---
    return {
        logId: pushID.newID({time: workerStartTime}),
        rayId: headers['cf-ray'],
        fpID: createBrowserFingerprint(request),
        deviceHash: sources.deviceHash,
        sessionHash: sources.sessionHash,
        tlsHash: sources.tlsHash,
        serverId: sources.serverId,
        requestTime: edgeRequestTime,
        receivedAt: new Date(workerStartTime).toISOString(),
        processedAt: new Date().toISOString(),
        queueTime: workerStartTime - edgeRequestTime,
        processingDurationMs: Date.now() - workerStartTime,
        clientTcpRtt: sources.cf.clientTcpRtt,
        sessionBin10: headers['x-cf-session-bin10'] ? parseInt(headers['x-cf-session-bin10'], 10) : null,
        sessionBin100: headers['x-cf-session-bin100'] ? parseInt(headers['x-cf-session-bin100'], 10) : null,
        requestUrl: request.url,
        requestMethod: request.method,
        requestHeaders: JSON.stringify(headers),
        requestBody: body,
        requestMimeType: headers['content-type'] || null,
        urlDomain: sources.urlDomain,
        urlPath: sources.urlPath,
        urlQuery: sources.urlQuery,
        headerBytes: new TextEncoder().encode(Object.entries(headers).join()).length,
        bodyBytes,
        bodyTruncated,
        clientIp: sources.clientIp,
        clientDeviceType: sources.deviceType,
        clientCookies: JSON.stringify(cookies),
        cId: headers['x-cid'] || cookies['_ss_cID'] || null,
        sId: headers['x-sid'] || cookies['_ss_sID'] || null,
        eId: headers['x-eid'] || cookies['_ss_eID'] || null,
        cfAsn: sources.cf.asn,
        cfAsOrganization: sources.cf.asOrganization,
        cfBotManagement: sources.cf.botManagement ? JSON.stringify(sources.cf.botManagement) : null,
        cfClientAcceptEncoding: sources.cf.clientAcceptEncoding,
        cfColo: sources.cf.colo,
        cfCountry: sources.cf.country,
        cfCity: sources.cf.city,
        cfContinent: sources.cf.continent,
        cfHttpProtocol: sources.httpProtocol,
        cfLatitude: sources.cf.latitude,
        cfLongitude: sources.cf.longitude,
        cfPostalCode: sources.cf.postalCode,
        cfRegion: sources.cf.region,
        cfRegionCode: sources.cf.regionCode,
        cfTimezone: sources.cf.timezone,
        cfTlsCipher: sources.tlsCipher,
        cfTlsVersion: sources.cf.tlsVersion,
        cfTlsClientAuth: sources.cf.tlsClientAuth ? JSON.stringify(sources.cf.tlsClientAuth) : null,
        geoId: sources.geoId,
        threatScore: sources.threatScore,
        threatCategory: headers['x-cf-threat-category'] || null,
        ja3Hash: sources.ja3Hash,
        verifiedBot: sources.verifiedBot,
        wafScore: headers['x-cf-waf-score'] ? parseInt(headers['x-cf-waf-score'], 10) : null,
        edgeServerIp: headers['x-cf-edge-ip'] || null,
        edgeServerPort: headers['x-cf-edge-port'] ? parseInt(headers['x-cf-edge-port'], 10) : null,
        clientPort: headers['x-cf-client-port'] ? parseInt(headers['x-cf-client-port'], 10) : null,
        zoneName: sources.zoneName,
        workerEnv: JSON.stringify(sanitizedEnv),
        data: serializedCustomData,
    };
}
