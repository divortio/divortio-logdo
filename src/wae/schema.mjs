/**
 * @file src/wae/schema.mjs
 * @description Defines the formal schema for operational metrics sent to the
 * Workers Analytics Engine (WAE). These typedefs provide a clear contract for the
 * data points related to the LogBatcher's internal operations.
 * @module WAESchema
 */

// === Batch Write Metrics ===

/**
 * Defines the structure of the `blobs` array for a batch write data point.
 * @typedef {Array<string>} BatchWriteBlobs
 * @property {string} 0 - The outcome of the write operation ("success" or "failure").
 * @property {string} 1 - The Cloudflare colo ID where the Durable Object is running.
 */

/**
 * Defines the structure of the `doubles` array for a batch write data point.
 * @typedef {Array<number>} BatchWriteDoubles
 * @property {number} 0 - The number of log entries in the batch.
 * @property {number} 1 - The duration of the D1 `batch()` operation in milliseconds.
 * @property {number} 2 - A constant value of 1, used to count the total number of write operations.
 */

// === Schema Migration Metrics ===

/**
 * Defines the structure of the `blobs` array for a schema migration data point.
 * @typedef {Array<string>} SchemaMigrationBlobs
 * @property {string} 0 - The type of migration ("create_table" or "alter_table").
 * @property {string} 1 - The new schema hash that was applied.
 * @property {string} 2 - The Cloudflare colo ID where the Durable Object is running.
 */

/**
 * Defines the structure of the `doubles` array for a schema migration data point.
 * @typedef {Array<number>} SchemaMigrationDoubles
 * @property {number} 0 - The duration of the entire schema migration in milliseconds.
 * @property {number} 1 - A constant value of 1, used to count migration events.
 */

// === Data Pruning Metrics ===

/**
 * Defines the structure of the `blobs` array for a data pruning data point.
 * @typedef {Array<string>} DataPruningBlobs
 * @property {string} 0 - The outcome of the pruning operation ("success" or "failure").
 * @property {string} 1 - The Cloudflare colo ID where the Durable Object is running.
 */

/**
 * Defines the structure of the `doubles` array for a data pruning data point.
 * @typedef {Array<number>} DataPruningDoubles
 * @property {number} 0 - The number of rows that were deleted from the table.
 * @property {number} 1 - The duration of the DELETE and ANALYZE operations in milliseconds.
 * @property {number} 2 - A constant value of 1, used to count pruning events.
 */