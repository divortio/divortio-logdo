/**
 * @file src/logger.mjs
 * @description This module is the core of the logging system. It handles the creation of
 * the log data object and routes it to the Durable Object based on the compiled log plan.
 * @module logger
 */

/**
 * @typedef {import('@cloudflare/workers-types').ExecutionContext} ExecutionContext
 * @typedef {import('@cloudflare/workers-types').Request} Request
 */



import {pushID} from './lib/pushID/pushID.js';
import {crc32} from './lib/crc32.js';

/**
 * @typedef {import('@cloudflare/workers-types').ExecutionContext} ExecutionContext
 * @typedef {import('@cloudflare/workers-types').Request} Request
 */

// --- Calculation & Extraction Helpers ---

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
 * Calculates a set of identifying hashes based on request properties.
 *
 * @private
 * @param {Request} request The incoming request object.
 * @param {string | null} clientIp The determined client IP address.
 * @param {string} userAgent The client's User-Agent string.
 * @returns {{tlsHash: string, deviceHash: string, connectionHash: string}} An object containing the calculated hashes.
 */
function calculateHashes(request, clientIp, userAgent) {
    const cf = request.cf || {};
    const ja3Hash = cf.botManagement?.ja3Hash || null;
    const tlsCipher = cf.tlsCipher || null;
    const tlsClientRandom = cf.tlsClientRandom || null;

    const tlsHash = String(crc32((ja3Hash || '') + (tlsCipher || '') + (tlsClientRandom || '')));
    const deviceHash = String(crc32(userAgent + (ja3Hash || '') + (tlsCipher || '')));
    const connectionHash = String(crc32((clientIp || '') + userAgent + (ja3Hash || '') + (tlsCipher || '')));

    return {tlsHash, deviceHash, connectionHash};
}

/**
 * Creates a concatenated geographic identifier string from the Cloudflare `cf` object.
 *
 * @private
 * @param {object} cf The Cloudflare `cf` object from the request.
 * @returns {string | null} The geographic ID (e.g., "NA-US-NY-New York-10001") or null.
 */
function buildGeoId(cf) {
    if (!cf) return null;
    return [cf.continent, cf.country, cf.regionCode, cf.city, cf.postalCode].filter(Boolean).join('-') || null;
}

// --- Public API & Main Logic ---

/**
 * The primary "fire-and-forget" logging function. It first executes the pre-compiled
 * filter functions to determine where the request should be logged.
 *
 * @param {Request} request The incoming request to be logged.
 * @param {object} [customData] Optional, arbitrary JSON-serializable data.
 * @param {object} env The Worker's environment bindings.
 * @param {ExecutionContext} ctx The execution context of the request.
 * @param {Array<object>} logPlan The pre-compiled log plan from the manager.
 */
export function logRequest(request, customData, env, ctx, logPlan) {
    // Determine which routes this request matches by executing each pre-compiled filter.
    const matchedRoutes = logPlan.filter(route => route.filter(request));

    // If the request doesn't match any routes, do nothing.
    if (matchedRoutes.length === 0) {
        return;
    }

    // If there are matches, proceed with logging.
    ctx.waitUntil(sendLog(request, customData, env, matchedRoutes));
}

/**
 * An internal async function that assembles the log data and sends it to the Durable Object.
 *
 * @private
 * @param {Request} request The incoming request.
 * @param {object} [customData] Optional custom data.
 * @param {object} env The Worker's environment bindings.
 * @param {Array<object>} matchedRoutes The routes this log should be written to.
 * @returns {Promise<void>}
 */
async function sendLog(request, customData, env, matchedRoutes) {
    try {
        const logData = await createLogData(request, customData, env);

        // Use a consistent shard ID based on the ray ID to ensure all logs for a
        // single request go to the same Durable Object instance.
        const shardId = request.headers.get('cf-ray') || logData.logId;
        const doId = env.LOG_BATCHER.idFromName(shardId);
        const stub = env.LOG_BATCHER.get(doId);

        // Make an RPC call, passing the log data and the routes it matched.
        stub.addLog(logData, matchedRoutes);

    } catch (e) {
        console.error("[LOGGING] Fatal error in sendLog:", e);
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
    const cf = request.cf || {};
    const url = new URL(request.url);

    // --- 1. Perform extractions and calculations ---
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

    // --- 2. Sanitize and prepare any remaining data ---
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

    // --- 3. Assemble the final log object ---
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
        cfTlsClientAuth: cf.tlsClientAuth ? JSON.stringify(cf.tlsClientAuth) : nulogRequestll,
        geoId: geoId,
        threatScore: cf.threatScore || null,
        ja3Hash: cf.botManagement?.ja3Hash || null,
        verifiedBot: cf.botManagement?.verifiedBot ?? null,
        workerEnv: JSON.stringify(sanitizedEnv),
        data: serializedCustomData,
    };
}