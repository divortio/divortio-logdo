# 4. Log Routing and Filtering

The Divortio D1 Logger includes a powerful routing and filtering pipeline that allows you to control precisely which
logs are stored, what data they contain, and how long they are retained. This enables you to create separate tables for
different purposes, such as security audits, performance monitoring, or user behavior analysis, while optimizing storage
costs.

---

### How It Works

The entire pipeline is configured through a "log plan," which is an array of route objects. When a request is logged, it
is evaluated against the filter conditions for each route in the plan. A single request can match multiple routes, and a
copy of the log will be written to each matching destination table.

The log plan is compiled once when a worker instance starts, combining a default "firehose" route with any custom routes
you define.

### The Default Firehose Route

By default, the logger includes a mandatory "firehose" route that captures all incoming logs without any filtering. This
ensures that you always have a complete record of all events. The configuration for this route is managed in
your `wrangler.toml` file.

**`wrangler.toml`**

```toml
[vars]
# The destination table for all logs.
LOG_HOSE_TABLE = "log_firehose"

# Optional: A JSON string of filter rules to apply to the firehose.
# LOG_HOSE_FILTERS =

# The retention policy for the firehose table.
LOG_HOSE_RETENTION_DAYS = 90
LOG_HOSE_PRUNING_INTERVAL_DAYS = 1
```

### Custom Log Routes

To create more specific logging rules, you can define custom routes in the **`_userLogRoutes.mjs`** file at the root of
your project. This file exports an array of `logRoutes` objects, each representing a distinct logging rule.

#### Structure of a Log Route

Each route object can have the following properties:

| Property                | Type            | Required | Description                                                                                                                   |
| :---------------------- | :-------------- | :------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **`tableName`** | `string`        | Yes      | The name of the D1 table to which logs should be written. A new table will be created automatically if it doesn't exist.        |
| **`filter`** | `Array<object>` | No       | An array of filter groups. A request must match at least one group to be logged. If omitted, all requests will match.        |
| **`columns`** | `Array<string>` | No       | An array of column names from the master schema to include in this table. If omitted, all columns will be included.             |
| **`retentionDays`** | `number`        | No       | The number of days to retain logs in this table.                                                                              |
| **`pruningIntervalDays`**| `number`        | No       | How often (in days) the retention policy should be checked for this table. Defaults to `1`.                                     |

#### Example: `_userLogRoutes.mjs`

Here are some examples of custom log routes. You can uncomment and modify them in your own `_userLogRoutes.mjs` file.

```javascript
export const logRoutes = [
    {
        // Route 1: Security Threats
        // Captures requests with a high Cloudflare threat score.
        tableName: "log_security_threats",
        filter: [
            { "cf.threatScore": { "greaterThan": 20 } }
        ],
        columns: [
            'logId', 'rayId', 'receivedAt', 'threatScore', 'ja3Hash',
            'clientIp', 'cfCountry', 'requestUrl', 'requestBody'
        ],
        retentionDays: 180
    },
    {
        // Route 2: Page Views
        // Captures navigation requests from browsers, excluding most bots.
        tableName: "log_page_views",
        filter: [
            { "header:accept": { "contains": "text/html" } },
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
        // Route 3: A/B Test Group
        // Captures requests that have a specific header for A/B testing.
        tableName: "log_ab_test_group_b",
        filter: [
            { "header:x-ab-test-group": { "equals": "B" } }
        ],
        columns: ['logId', 'rayId', 'receivedAt', 'requestUrl', 'uID'],
        retentionDays: 30
    }
];
```

---
