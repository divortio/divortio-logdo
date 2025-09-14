/**
 * @file src/schema.mjs
 * @description Defines the schema for the log table in a structured JavaScript object
 * and exports a deterministic hash of that schema to act as its version.
 * @module SchemaDefinition
 */

import {hashIsh} from '../lib/pushID/pushID.js';

/**
 * The single source of truth for the database table structure. This "master schema"
 * contains all possible columns that can be logged. Individual log routes can specify
 * a subset of these columns.
 *
 * @property {string} type - The SQL data type for the column (e.g., TEXT, INTEGER, BOOLEAN).
 * @property {string} [constraints] - Any additional SQL constraints (e.g., 'PRIMARY KEY').
 * @property {boolean} indexed - If true, a database index will be created for this column.
 */
export const tableSchema = {
    logId: {type: 'TEXT', constraints: 'PRIMARY KEY', indexed: false},
    rayId: {type: 'TEXT', indexed: true},
    fpID: {type: 'TEXT', indexed: true},
    deviceHash: {type: 'TEXT', indexed: false},
    connectionHash: {type: 'TEXT', indexed: true},
    tlsHash: {type: 'TEXT', indexed: false},
    requestTime: {type: 'INTEGER', indexed: false},
    receivedAt: {type: 'DATETIME', indexed: true},
    processedAt: {type: 'DATETIME', indexed: false},
    processingDurationMs: {type: 'INTEGER', indexed: false},
    clientTcpRtt: {type: 'INTEGER', indexed: false},
    sample10: {type: 'INTEGER', indexed: false},
    sample100: {type: 'INTEGER', indexed: false},
    requestUrl: {type: 'TEXT', indexed: false},
    requestMethod: {type: 'TEXT', indexed: false},
    requestHeaders: {type: 'TEXT', indexed: false},
    requestBody: {type: 'TEXT', indexed: false},
    requestMimeType: {type: 'TEXT', indexed: false},
    urlDomain: {type: 'TEXT', indexed: false},
    urlPath: {type: 'TEXT', indexed: false},
    urlQuery: {type: 'TEXT', indexed: false},
    headerBytes: {type: 'INTEGER', indexed: false},
    bodyBytes: {type: 'INTEGER', indexed: false},
    bodyTruncated: {type: 'BOOLEAN', indexed: false},
    clientIp: {type: 'TEXT', indexed: false},
    clientDeviceType: {type: 'TEXT', indexed: false},
    clientCookies: {type: 'TEXT', indexed: false},
    cId: {type: 'TEXT', indexed: false},
    sId: {type: 'TEXT', indexed: false},
    eId: {type: 'TEXT', indexed: false},
    uID: {type: 'TEXT', indexed: false},
    emID: {type: 'TEXT', indexed: false},
    emA: {type: 'TEXT', indexed: false},
    cfAsn: {type: 'INTEGER', indexed: false},
    cfAsOrganization: {type: 'TEXT', indexed: false},
    cfBotManagement: {type: 'TEXT', indexed: false},
    cfClientAcceptEncoding: {type: 'TEXT', indexed: false},
    cfColo: {type: 'TEXT', indexed: false},
    cfCountry: {type: 'TEXT', indexed: false},
    cfCity: {type: 'TEXT', indexed: false},
    cfContinent: {type: 'TEXT', indexed: false},
    cfHttpProtocol: {type: 'TEXT', indexed: false},
    cfLatitude: {type: 'TEXT', indexed: false},
    cfLongitude: {type: 'TEXT', indexed: false},
    cfPostalCode: {type: 'TEXT', indexed: false},
    cfRegion: {type: 'TEXT', indexed: false},
    cfRegionCode: {type: 'TEXT', indexed: false},
    cfTimezone: {type: 'TEXT', indexed: false},
    cfTlsCipher: {type: 'TEXT', indexed: false},
    cfTlsVersion: {type: 'TEXT', indexed: false},
    cfTlsClientAuth: {type: 'TEXT', indexed: false},
    geoId: {type: 'TEXT', indexed: true},
    threatScore: {type: 'INTEGER', indexed: false},
    ja3Hash: {type: 'TEXT', indexed: false},
    verifiedBot: {type: 'BOOLEAN', indexed: false},
    workerEnv: {type: 'TEXT', indexed: false},
    data: {type: 'TEXT', indexed: false},
};

/**
 * A 16-character deterministic hash of the `tableSchema` object.
 * This is used to automatically detect and apply schema changes.
 * @type {string}
 */
export const SCHEMA_HASH = hashIsh(tableSchema, 16);