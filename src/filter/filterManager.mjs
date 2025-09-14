/**
 * @file src/filterManager.mjs
 * @description Parses and "compiles" logging filter rules from a configuration
 * object into a highly performant function for request evaluation.
 * @module FilterManager
 */

/**
 * Compiles an array of filter rule groups into a single function.
 *
 * @param {Array<object> | null | undefined} filterGroups The array of rule groups from the config.
 * @returns {(request: Request) => boolean} A function that takes a request and returns true if it should be logged.
 */
function compileFilters(filterGroups) {
    // If filters are null, undefined, or empty, create a function that allows all requests.
    if (!filterGroups || filterGroups.length === 0) {
        return () => true;
    }

    const compiledGroups = filterGroups.map(group => {
        const rules = Object.entries(group).map(([key, condition]) => {
            const [source, property] = key.split('.');
            const operator = Object.keys(condition)[0];
            const value = condition[operator];

            // Return a specialized, highly performant function for each rule.
            switch (source) {
                case 'header':
                    return (request) => checkCondition(request.headers.get(property), operator, value);
                case 'url':
                    // URL needs to be parsed once per request, not per rule.
                    return (request, url) => checkCondition(url[property], operator, value);
                default:
                    // If the source (e.g., 'header', 'url') is unknown, the rule fails.
                    return () => false;
            }
        });

        // Return a function that checks if ALL rules in this group pass.
        return (request, url) => rules.every(rule => rule(request, url));
    });

    // Return a final function that checks if ANY of the groups pass.
    return (request) => {
        const url = new URL(request.url);
        return compiledGroups.some(group => group(request, url));
    };
}

/**
 * Performs the actual string comparison for a given condition.
 *
 * @private
 * @param {string | null} subject The value from the request (e.g., a header value).
 * @param {string} operator The comparison operator (e.g., 'contains', 'equals').
 * @param {string} value The value to compare against from the filter configuration.
 * @returns {boolean} The result of the comparison.
 */
function checkCondition(subject, operator, value) {
    if (subject === null) return false;
    switch (operator) {
        case 'equals':
            return subject === value;
        case 'contains':
            return subject.includes(value);
        case 'startsWith':
            return subject.startsWith(value);
        case 'endsWith':
            return subject.endsWith(value);
        default:
            // If an unsupported operator is used, the rule fails.
            return false;
    }
}

/**
 * Parses and compiles the filter configuration from an environment variable or a routes file.
 *
 * @param {Array<object> | null | undefined} filterConfig The filter definition array.
 * @returns {(request: Request) => boolean} A compiled filter function.
 */
export function createFilter(filterConfig) {
    try {
        return compileFilters(filterConfig);
    } catch (e) {
        console.error("[FilterManager] FATAL: Could not compile filter rules. Logging for this route will be disabled.", {
            error: e.message,
            config: filterConfig
        });
        // If the filter configuration is structurally invalid, create a function that logs nothing to prevent errors.
        return () => false;
    }
}