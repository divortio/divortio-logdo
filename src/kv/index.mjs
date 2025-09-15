/**
 * @file src/kv/index.mjs
 * @description This module contains the logic for writing state snapshots and recent
 * batch data to a Workers KV namespace for real-time observability and debugging.
 * @module KVLogic
 */

/**
 * @typedef {import('@cloudflare/workers-types').KVNamespace} KVNamespace
 * @typedef {import('./schema.mjs').BatcherState} BatcherState
 * @typedef {import('./schema.mjs').LastBatch} LastBatch
 * @typedef {import('./schema.mjs').LastEvent} LastEvent
 * @typedef {import('./schema.mjs').LastFailedBatch} LastFailedBatch
 * @typedef {import('./schema.mjs').DeadLetterBatch} DeadLetterBatch
 * @typedef {import('./schema.mjs').PruningSummary} PruningSummary
 * @typedef {import('./schema.mjs').PruningResult} PruningResult
 */

/**
 * A helper function to safely write a value to a KV namespace.
 * @private
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {string} key - The key to write to.
 * @param {object | Array<object>} value - The object or array to store.
 * @param {number} [ttl] - Optional Time-To-Live for the key in seconds.
 */
async function putKV(kv, key, value, ttl) {
    if (!kv) return;
    try {
        const options = ttl ? {expirationTtl: ttl} : {};
        await kv.put(key, JSON.stringify(value), options);
    } catch (e) {
        console.error(`[KV] Failed to write to key "${key}"`, {
            error: e.message,
            cause: e.cause?.message,
        });
    }
}

/**
 * Creates a snapshot of a Durable Object's current in-memory state and writes it to KV.
 *
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {string} doId - The hex ID of the Durable Object instance.
 * @param {Map<string, Array<object>>} batches - The Durable Object's internal map of batches.
 */
export async function updateBatcherState(kv, doId, batches) {
    const batchDetails = Array.from(batches.entries()).map(([tableName, batch]) => ({
        tableName,
        count: batch.length,
    }));
    const totalLogs = batchDetails.reduce((sum, batch) => sum + batch.count, 0);

    /** @type {BatcherState} */
    const state = {
        doId: doId,
        lastUpdate: new Date().toISOString(),
        totalPendingLogs: totalLogs,
        batchCount: batches.size,
        batches: batchDetails,
    };
    await putKV(kv, `state_${doId}`, state);
}

/**
 * Registers a Durable Object instance as active by writing a key with a short TTL.
 *
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {string} doId - The hex ID of the Durable Object instance.
 * @param {string} colo - The colo where the DO is running.
 */
export async function registerActiveDO(kv, doId, colo) {
    await putKV(kv, `active_do_${doId}`, {colo, lastSeen: new Date().toISOString()}, 65);
}

/**
 * Saves the most recent batch of logs that was successfully written to the firehose table to KV.
 *
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {LastBatch} batch - An array of the full log data objects.
 */
export async function saveLastFirehoseBatch(kv, batch) {
    await putKV(kv, 'last_firehose_batch', batch);
}

/**
 * Saves the single most recent log entry from a successfully processed firehose batch.
 *
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {LastEvent} event - The last log data object from the batch.
 */
export async function saveLastFirehoseEvent(kv, event) {
    await putKV(kv, 'last_firehose_event', event);
}

/**
 * Saves the details of a failed D1 batch write to KV for debugging.
 *
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {string} tableName - The name of the table the write failed on.
 * @param {Error} error - The error object from the catch block.
 * @param {Array<object>} batch - The batch of logs that failed to write.
 */
export async function saveFailedBatch(kv, tableName, error, batch) {
    /** @type {LastFailedBatch} */
    const failureRecord = {
        timestamp: new Date().toISOString(),
        tableName: tableName,
        error: error.message,
        batch: batch,
    };
    await putKV(kv, 'last_failed_batch', failureRecord);
}

/**
 * Saves a persistently failing batch to the dead-letter queue KV for manual inspection.
 *
 * @param {KVNamespace} [kv] - The `LOGDO_DEAD_LETTER` KV namespace binding.
 * @param {string} tableName - The name of the table the write failed on.
 * @param {Error} error - The last error object from the catch block.
 * @param {Array<object>} batch - The batch of logs that failed.
 * @param {string} doId - The ID of the Durable Object that processed the batch.
 */
export async function saveDeadLetterBatch(kv, tableName, error, batch, doId) {
    /** @type {DeadLetterBatch} */
    const record = {
        timestamp: new Date().toISOString(),
        tableName,
        error: error.message,
        doId,
        batch,
    };
    const key = `deadletter_${tableName}_${new Date().toISOString()}`;
    await putKV(kv, key, record);
}


/**
 * Updates the centralized pruning summary in KV with the result of a pruning operation.
 *
 * @param {KVNamespace} [kv] - The KV namespace binding.
 * @param {string} tableName - The name of the table that was pruned.
 * @param {number} rowsDeleted - The number of rows deleted.
 * @param {number} durationMs - The duration of the pruning operation.
 */
export async function updatePruningSummary(kv, tableName, rowsDeleted, durationMs) {
    if (!kv) return;
    const summaryKey = 'pruning_summary';
    /** @type {PruningSummary} */
    let summary = {};
    try {
        summary = await kv.get(summaryKey, 'json') || {};
    } catch (e) {
        console.error(`[KV] Could not parse existing pruning summary. Starting fresh.`, e);
    }

    /** @type {PruningResult} */
    summary[tableName] = {
        lastPrunedTimestamp: new Date().toISOString(),
        lastRowsDeleted: rowsDeleted,
        lastPruneDurationMs: durationMs,
    };

    await putKV(kv, summaryKey, summary);
}