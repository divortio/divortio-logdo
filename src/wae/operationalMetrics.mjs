/**
 * @file src/wae/operationalMetrics.mjs
 * @description Contains the logic for sending operational metrics about the LogBatcher's
 * performance and health to the Workers Analytics Engine (WAE).
 * @module OperationalMetrics
 */

/**
 * @typedef {import('@cloudflare/workers-types').AnalyticsEngineDataset} AnalyticsEngineDataset
 * @typedef {import('../logPlanManager.mjs').CompiledLogRoute} CompiledLogRoute
 */

/**
 * A helper function to safely send a data point to a WAE dataset.
 * @private
 * @param {AnalyticsEngineDataset} [dataset] - The WAE dataset binding.
 * @param {string} index - The high-cardinality index for the data point.
 * @param {Array<string>} blobs - The array of string dimensions.
 * @param {Array<number>} doubles - The array of numeric metrics.
 */
function sendMetric(dataset, index, blobs, doubles) {
    if (!dataset) return;
    try {
        dataset.writeDataPoint({
            indexes: [index],
            blobs,
            doubles,
        });
    } catch (e) {
        console.error(`[WAE] Failed to send metric`, {dataset: dataset.dataset, error: e.message});
    }
}

/**
 * Sends a metric about a batch write operation.
 *
 * @param {object} env - The worker's environment bindings.
 * @param {string} tableName - The name of the table the batch was written to.
 * @param {string} outcome - The result of the operation ("success" or "failure").
 * @param {number} batchSize - The number of logs in the batch.
 * @param {number} durationMs - The duration of the D1 write operation in milliseconds.
 */
export function sendBatchWriteMetric(env, tableName, outcome, batchSize, durationMs) {
    /** @type {import('./schema.mjs').BatchWriteBlobs} */
    const blobs = [
        outcome,
        env.colo || 'unknown',
    ];
    /** @type {import('./schema.mjs').BatchWriteDoubles} */
    const doubles = [
        batchSize,
        durationMs,
        1, // writeCount
    ];
    sendMetric(env.METRICS_BATCH_WRITES, tableName, blobs, doubles);
}

/**
 * Sends a metric about a schema migration event.
 *
 * @param {object} env - The worker's environment bindings.
 * @param {CompiledLogRoute} route - The compiled log route that was migrated.
 * @param {string} migrationType - The type of migration ("create_table" or "alter_table").
 * @param {number} durationMs - The duration of the migration in milliseconds.
 */
export function sendSchemaMigrationMetric(env, route, migrationType, durationMs) {
    /** @type {import('./schema.mjs').SchemaMigrationBlobs} */
    const blobs = [
        migrationType,
        route.schemaHash,
        env.colo || 'unknown',
    ];
    /** @type {import('./schema.mjs').SchemaMigrationDoubles} */
    const doubles = [
        durationMs,
        1, // migrationCount
    ];
    sendMetric(env.METRICS_SCHEMA_MIGRATIONS, route.tableName, blobs, doubles);
}

/**
 * Sends a metric about a data pruning operation.
 *
 * @param {object} env - The worker's environment bindings.
 * @param {string} tableName - The name of the table that was pruned.
 * @param {string} outcome - The result of the operation ("success" or "failure").
 * @param {number} rowsDeleted - The number of rows deleted.
 * @param {number} durationMs - The duration of the pruning operation in milliseconds.
 */
export function sendDataPruningMetric(env, tableName, outcome, rowsDeleted, durationMs) {
    /** @type {import('./schema.mjs').DataPruningBlobs} */
    const blobs = [
        outcome,
        env.colo || 'unknown',
    ];
    /** @type {import('./schema.mjs').DataPruningDoubles} */
    const doubles = [
        rowsDeleted,
        durationMs,
        1, // pruneCount
    ];
    sendMetric(env.METRICS_DATA_PRUNING, tableName, blobs, doubles);
}