/**
 * @file /_userLogRoutes.mjs
 * @description Optional, user-defined log routing and retention configuration.
 * This file, if present at the project root, will be used to configure the
 * entire Log Routing Pipeline.
 */

export const logRoutes = [
    // --- Example Routes ---
    // Uncomment and modify these examples to create your own log routing and retention policies.

    /*
    {
        // Route 1: Dynamic Header - Log requests that have a specific A/B test header.
        tableName: "log_ab_test_group_b",
        filter: [
            { "header:x-ab-test-group": { "equals": "B" } }
        ],
        columns: ['logId', 'rayId', 'receivedAt', 'requestUrl', 'uID'],
        retentionDays: 30
    },
    {
        // Route 2: Dynamic Cookie - Log requests from users with a specific session cookie.
        tableName: "log_special_session",
        filter: [
            { "cookie:_session_id": { "startsWith": "special-session-" } }
        ],
        columns: ['logId', 'rayId', 'receivedAt', 'requestUrl', 'uID'],
        retentionDays: 7
    },
    {
        // Route 3: Page Views - Log browser navigation requests, excluding most bots.
        tableName: "log_pageViews",
        filter: [
            { "header.accept": { "contains": "text/html" } },
            { "cf.botManagement.score": { "lessThan": 30 } }
        ],
        columns: [
            'logId', 'rayId', 'receivedAt', 'requestUrl',
            'clientIp', 'cfCountry', 'connectionHash', 'uID'
        ],
        retentionDays: 365,
        pruningIntervalDays: 7
    },
    {
        // Route 4: Security Threats - Log requests with a high threat score.
        tableName: "log_security_threats",
        filter: [
            { "cf.threatScore": { "greaterThan": 20 } }
        ],
        columns: [
            'logId', 'rayId', 'receivedAt', 'threatScore', 'ja3Hash',
            'clientIp', 'cfCountry', 'requestUrl', 'requestBody'
        ],
        retentionDays: 180
    }
    */
];