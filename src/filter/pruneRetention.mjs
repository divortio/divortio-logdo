/**
 * @file src/pruneRetention.mjs
 * @description This module contains the core logic for handling data retention. It provides
 * a function to prune old log entries from a specified D1 table.
 * @module PruningLogic
 */

/**
 * Executes a pruning operation on a given table to enforce a data retention policy.
 * It deletes all records older than the specified retention period and then re-analyzes
 * the table to optimize database performance.
 *
 * @param {D1Database} db The D1 database binding.
 * @param {string} tableName The name of the table to prune.
 * @param {number} retentionDays The number of days of data to keep. Records older than this will be deleted.
 * @returns {Promise<void>} A promise that resolves when the pruning operation is complete.
 */
export async function pruneTable(db, tableName, retentionDays) {
    console.log(`[Pruner] Starting retention check for table "${tableName}" with a ${retentionDays}-day retention policy.`);

    try {
        // Calculate the cutoff date. All records with a `receivedAt` timestamp
        // earlier than this date will be deleted.
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffTimestamp = cutoffDate.toISOString();

        // Prepare the DELETE statement to remove old logs.
        const deleteStmt = db.prepare(`DELETE FROM ${tableName} WHERE receivedAt < ?1`).bind(cutoffTimestamp);

        const result = await deleteStmt.run();

        if (result.meta.changes > 0) {
            console.log(`[Pruner] Successfully deleted ${result.meta.changes} old records from "${tableName}".`);

            // After a significant number of deletions, it's a best practice to
            // re-analyze the table. This helps the query planner make better
            // decisions, which can improve query performance.
            console.log(`[Pruner] Analyzing table "${tableName}" to optimize performance...`);
            await db.exec(`ANALYZE ${tableName};`);
            console.log(`[Pruner] Analysis complete for "${tableName}".`);
        } else {
            console.log(`[Pruner] No old records to prune from "${tableName}".`);
        }

    } catch (e) {
        console.error(`[Pruner] FATAL: Failed to prune data for table "${tableName}".`, {
            error: e.message,
            cause: e.cause?.message,
        });
        // Re-throw the error so it can be caught by the calling context if needed.
        throw e;
    }
}