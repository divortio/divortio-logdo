/**
 * @file src/lib/crc32.js
 * @description A standard JavaScript implementation of the CRC32 hashing algorithm.
 * This implementation conforms to the CRC-32/ISO-HDLC standard, which uses a
 * polynomial of 0xEDB88320. This ensures consistency with the `crc32()` function
 * available in Cloudflare Transform Rules and other common systems.
 * @module CRC32
 */

/**
 * Generates the CRC table for the polynomial. This is done once on module load.
 * @private
 * @returns {Array<number>} The CRC lookup table.
 */
function makeCRCTable() {
    let c;
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}

const crcTable = makeCRCTable();

/**
 * Calculates the CRC32 hash of a given string.
 * @param {string} str The string to hash.
 * @returns {number} The 32-bit unsigned integer hash.
 */
export function crc32(str) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}