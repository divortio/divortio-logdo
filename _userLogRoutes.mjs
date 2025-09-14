/**
 * @file /_userLogRoutes.mjs
 * @description Optional, user-defined log routing configuration.
 * To use, modify this file with your custom log routes. If this file is
 * not present or is left empty, the logger will default to the firehose
 * configuration in `wrangler.toml`.
 */

export const logRoutes = [
    // --- Example Routes ---
    // Uncomment and modify these examples to create your own log routing pipeline.

    /*
    {
        // Route 1: A full, unfiltered copy of all logs to a specific table.
        tableName: "log_firehose_copy",
        filter: null, // null or [] means no filtering
        columns: null // null means all columns from the master schema
    },
    {
        // Route 2: A filtered table for just page views.
        tableName: "log_pageViews",
        filter: [
            { "header.accept": { "contains": "text/html" } }
        ],
        columns: null
    },
    {
        // Route 3: A specialized, smaller table for API performance monitoring.
        tableName: "log_api_perf",
        filter: [
            { "url.pathname": { "startsWith": "/api/v1/" } }
        ],
        // Only include a subset of columns to save storage space.
        columns: [
            'logId',
            'rayId',
            'requestTime',
            'processingDurationMs',
            'requestUrl',
            'requestMethod',
            'clientIp'
        ]
    }
    */
];