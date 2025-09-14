/**
 * @file src/logPlanManager.mjs
 * @description Compiles the complete logging plan, either from a root `_userLogRoutes.mjs`
 * file (via a build-time copy) or from the default firehose configuration in `wrangler.toml`.
 * This compilation happens once when a worker instance starts.
 * @module LogPlanManager
 */

import {tableSchema} from '../schema/schema.mjs';
import {createFilter} from './filterManager.mjs';
import {hashIsh} from '../lib/pushID/pushID.js';
import {logRoutes as userLogRoutes} from '../routes/userLogRoutes.mjs';

/**
 * Compiles the complete log plan for the worker. It uses the statically imported user routes
 * or falls back to the firehose configuration from the environment.
 *
 * @param {object} env The worker's environment bindings.
 * @returns {Promise<Array<object>>} A promise that resolves with the compiled log plan.
 * Each object in the plan contains a tableName, a compiled filter function, the relevant schema, and a schema hash.
 */
export async function compileLogPlan(env) {
    let routes = [];

    // The build script ensures that src/userLogRoutes.mjs contains the user's config.
    if (userLogRoutes && userLogRoutes.length > 0) {
        console.log(`[LogPlanManager] Found ${userLogRoutes.length} user-defined log routes. Compiling plan...`);
        routes = userLogRoutes;
    } else {
        // Fallback to the default firehose configuration if no user routes are defined.
        console.log(`[LogPlanManager] No user-defined routes found. Using default firehose configuration.`);
        routes = [{
            tableName: env.LOG_HOSE_TABLE || 'log_firehose',
            filter: env.LOG_HOSE_FILTERS ? JSON.parse(env.LOG_HOSE_FILTERS) : null,
            columns: null
        }];
    }

    return routes.map(route => {
        if (!route.tableName) {
            throw new Error('[LogPlanManager] FATAL: A log route is missing the required "tableName" property.');
        }

        // Create a subset of the master schema if `columns` are specified for this route.
        const routeSchema = (route.columns && Array.isArray(route.columns))
            ? route.columns.reduce((acc, col) => {
                if (tableSchema[col]) {
                    acc[col] = tableSchema[col];
                } else {
                    // It's critical to throw an error here to fail the build early
                    // if the user specifies a column that doesn't exist in the master schema.
                    throw new Error(`[LogPlanManager] FATAL: Column "${col}" in route "${route.tableName}" does not exist in the master schema.`);
                }
                return acc;
            }, {})
            : tableSchema;

        return {
            tableName: route.tableName,
            filter: createFilter(route.filter),
            schema: routeSchema,
            schemaHash: hashIsh(routeSchema, 16)
        };
    });
}