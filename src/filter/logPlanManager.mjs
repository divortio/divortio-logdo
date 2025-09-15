/**
 * @file src/logPlanManager.mjs
 * @description Compiles the complete logging plan. It always includes the default firehose
 * route from wrangler.toml and appends any additional routes defined in _userLogRoutes.mjs.
 * This compilation happens once when a worker instance starts.
 * @module LogPlanManager
 */

import {tableSchema} from '../schema/schema.mjs';
import {createFilter} from './filterManager.mjs';
import {hashIsh} from '../lib/pushID/pushID.js';
import {logRoutes as userLogRoutes} from '../routes/userLogRoutes.mjs';

/**
 * @typedef {import('./filterManager.mjs').FilterFn} FilterFn
 */

/**
 * @typedef {object} LogRouteConfig
 * @property {string} tableName - The destination D1 table for this route.
 * @property {Array<object> | null} [filter] - The filter definition.
 * @property {Array<string> | null} [columns] - An optional array of column names to include.
 * @property {number} [retentionDays] - Optional number of days to keep logs.
 * @property {number} [pruningIntervalDays] - Optional interval in days for pruning checks.
 */

/**
 * @typedef {object} CompiledLogRoute
 * @property {string} tableName - The destination D1 table.
 * @property {FilterFn} filter - The pre-compiled filter function for this route.
 * @property {object} schema - The (potentially subsetted) schema object for this route.
 * @property {string} schemaHash - The deterministic hash of the schema for this route.
 * @property {number} [retentionDays] - Optional retention period in days.
 * @property {number} [pruningIntervalDays] - Optional pruning interval in days.
 */

/**
 * Compiles the complete log plan for the worker.
 *
 * @param {object} env The worker's environment bindings.
 * @returns {Promise<Array<CompiledLogRoute>>} A promise that resolves with the compiled log plan.
 */
export async function compileLogPlan(env) {
    /** @type {Array<LogRouteConfig>} */
    const routes = [];

    // 1. Always create the default firehose route from wrangler.toml variables.
    const firehoseRoute = {
        tableName: env.LOG_HOSE_TABLE || 'log_firehose',
        filter: env.LOG_HOSE_FILTERS ? JSON.parse(env.LOG_HOSE_FILTERS) : null,
        columns: null, // The firehose always uses the full master schema.
        retentionDays: env.LOG_HOSE_RETENTION_DAYS || 90,
        pruningIntervalDays: env.LOG_HOSE_PRUNING_INTERVAL_DAYS || 1,
    };
    routes.push(firehoseRoute);

    // 2. Append any additional, user-defined routes.
    if (userLogRoutes && userLogRoutes.length > 0) {
        console.log(`[LogPlanManager] Found ${userLogRoutes.length} user-defined log routes. Appending to the log plan...`);
        routes.push(...userLogRoutes);
    } else {
        console.log(`[LogPlanManager] No user-defined routes found. Using only the default firehose configuration.`);
    }

    // 3. Compile the final, combined list of routes.
    return routes.map(route => {
        if (!route.tableName) {
            throw new Error('[LogPlanManager] FATAL: A log route is missing the required "tableName" property.');
        }

        const routeSchema = (route.columns && Array.isArray(route.columns))
            ? route.columns.reduce((acc, col) => {
                if (tableSchema[col]) {
                    acc[col] = tableSchema[col];
                } else {
                    throw new Error(`[LogPlanManager] FATAL: Column "${col}" in route "${route.tableName}" does not exist in the master schema.`);
                }
                return acc;
            }, {})
            : tableSchema;

        return {
            tableName: route.tableName,
            filter: createFilter(route.filter),
            schema: routeSchema,
            schemaHash: hashIsh(routeSchema, 16),
            retentionDays: route.retentionDays,
            pruningIntervalDays: route.pruningIntervalDays,
        };
    });
}