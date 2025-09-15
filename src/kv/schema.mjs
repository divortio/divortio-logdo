/**
 * @file src/kv/schema.mjs
 * @description Defines the formal schema for data objects stored in the Workers KV
 * namespace for state snapshotting and debugging.
 * @module KVSchema
 */

/**
 * Represents a snapshot of a single LogBatcher Durable Object's in-memory state.
 * @typedef {object} BatcherState
 * @property {string} doId - The hex ID of the Durable Object instance.
 * @property {string} lastUpdate - An ISO 8601 timestamp of when this state was snapshotted.
 * @property {number} totalPendingLogs - The total number of logs held in memory across all batches.
 * @property {number} batchCount - The number of distinct table batches currently in memory.
 * @property {Array<{tableName: string, count: number}>} batches - An array detailing the size of each in-memory batch.
 */

/**
 * Represents the most recent batch of log data that was successfully written to the firehose table.
 * @typedef {Array<object>} LastBatch
 */

/**
 * Represents the single most recent log entry from a successfully processed firehose batch.
 * @typedef {object} LastEvent
 */

/**
 * Represents the payload stored in KV when a D1 batch write operation fails.
 * @typedef {object} LastFailedBatch
 * @property {string} timestamp - An ISO 8601 timestamp of when the failure occurred.
 * @property {string} tableName - The name of the table that the write failed on.
 * @property {string} error - The error message from the exception.
 * @property {Array<object>} batch - A copy of the batch of logs that failed to be written.
 */

/**
 * Represents the payload for a batch that has failed repeatedly and is being moved
 * to a dead-letter queue for manual inspection.
 * @typedef {object} DeadLetterBatch
 * @property {string} timestamp - An ISO 8601 timestamp of when the batch was moved to the dead-letter queue.
 * @property {string} tableName - The name of the table the write failed on.
 * @property {string} error - The last error message received.
 * @property {string} doId - The ID of the Durable Object instance that processed the batch.
 * @property {Array<object>} batch - A copy of the batch of logs that failed.
 */

/**
 * Represents a summary of the latest pruning operation for a single table.
 * @typedef {object} PruningResult
 * @property {string} lastPrunedTimestamp - An ISO 8601 timestamp of the last successful prune.
 * @property {number} lastRowsDeleted - The number of rows deleted in the last run.
 * @property {number} lastPruneDurationMs - The duration of the last pruning operation in milliseconds.
 */

/**
 * A centralized object storing the pruning summary for all tables. The key is the table name.
 * @typedef {Object<string, PruningResult>} PruningSummary
 */