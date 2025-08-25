/**
 * @file src/fingerprint.js
 * @description Creates a stable browser fingerprint from request properties.
 */

// We are reusing the hashIsh function from our pushID library to ensure
// a consistent and stable hashing mechanism across the application.
import {hashIsh} from './lib/pushID/hashIsh.js';

// Using the same character set as the pushID library ensures that the output
// of our hashes is consistent in its format and character distribution.
const HASH_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';

/**
 * Creates a stable, high-entropy browser fingerprint from various request properties.
 * This function is designed to generate a consistent identifier for a specific browser
 * and device combination, which can be useful for tracking unique visitors without
 * relying on cookies.
 *
 * @param {Request} request - The original incoming request object from which to derive the fingerprint.
 * @returns {string} A 16-character, stable hash representing the browser fingerprint (fpID).
 * @example
 * // In your logger.js or a similar file:
 * const fingerprint = createBrowserFingerprint(request);
 * // -> fingerprint will be a 16-character hash like "aBcDeFgHiJkLmNoP"
 */
export function createBrowserFingerprint(request) {
    // 1. Gather as many high-entropy data points as possible from the request.
    // These are properties that are likely to be consistent for a specific user's setup.
    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';
    const acceptLang = request.headers.get('accept-language') || '';
    const acceptEnc = request.headers.get('accept-encoding') || '';

    // 2. Use TLS cipher, HTTP protocol, and colo from the Cloudflare-specific 'cf' object.
    // These are excellent signals as they are tied to the client's underlying software and network location.
    const tlsCipher = request.cf?.tlsCipher || '';
    const httpProtocol = request.cf?.httpProtocol || '';
    const colo = request.cf?.colo || ''; // The user's closest Cloudflare data center

    // 3. Combine all data points into a single object.
    // The `hashIsh` function will serialize this object with sorted keys, ensuring that
    // the order of properties does not affect the final hash.
    const rawFingerprintData = {
        ip,
        userAgent,
        acceptLang,
        acceptEnc,
        tlsCipher,
        httpProtocol,
        colo
    };

    // 4. Use the robust hashIsh function to generate a 16-character hash.
    // This provides significantly more entropy than a simple base36 hash and is
    // optimized for speed and consistency.
    return hashIsh(rawFingerprintData, 16, HASH_CHARS);
}
