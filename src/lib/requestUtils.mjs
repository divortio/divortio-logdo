/**
 * @file src/lib/requestUtils.mjs
 * @description A collection of utility functions for extracting and calculating data
 * from a Cloudflare Worker Request object.
 * @module RequestUtils
 */

import {crc32} from './crc32.js';

/**
 * @typedef {import('@cloudflare/workers-types').Request} Request
 * @typedef {import('@cloudflare/workers-types').D1Database} D1Database
 */

/**
 * The structure of the object returned by the `extractBody` function.
 * @typedef {object} ExtractedBody
 * @property {string|null} body - The truncated request body as a string.
 * @property {number} bodyBytes - The original size of the request body in bytes.
 * @property {boolean} bodyTruncated - A flag indicating if the body was truncated.
 */

/**
 * The structure of the object containing calculated request hashes.
 * @typedef {object} CalculatedHashes
 * @property {string} tlsHash - A hash of the JA3, cipher, and random value to fingerprint the TLS connection.
 * @property {string} deviceHash - A hash of the User-Agent and TLS signature to identify the device type.
 * @property {string} connectionHash - A hash of the IP, User-Agent, and TLS signature to identify a user's session.
 */

/**
 * Parses the 'cookie' header from a request into a key-value object.
 *
 * @param {Request} request The incoming request object.
 * @returns {Object<string, string>} A key-value map of the parsed cookies.
 */
export function parseCookies(request) {
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
 * @param {Request} request The incoming request object.
 * @param {object} env The worker's environment bindings, containing MAX_BODY_SIZE.
 * @returns {Promise<ExtractedBody>} An object with the body, its size, and truncation status.
 */
export async function extractBody(request, env) {
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
 * @param {string | null} userAgent The User-Agent header string from the request.
 * @returns {string | null} The determined device type or null if the User-Agent is not present.
 */
export function getDeviceType(userAgent) {
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
 * @param {Request} request The incoming request object.
 * @param {string | null} clientIp The determined client IP address.
 * @param {string} userAgent The client's User-Agent string.
 * @returns {CalculatedHashes} An object containing the calculated hashes.
 */
export function calculateHashes(request, clientIp, userAgent) {
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
 * @param {object} cf The Cloudflare `cf` object from the request.
 * @returns {string | null} The geographic ID (e.g., "NA-US-NY-New York-10001") or null.
 */
export function buildGeoId(cf) {
    if (!cf) return null;
    return [cf.continent, cf.country, cf.regionCode, cf.city, cf.postalCode].filter(Boolean).join('-') || null;
}