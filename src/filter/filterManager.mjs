/**
 * @file src/filterManager.mjs
 * @description Parses and "compiles" logging filter rules from a configuration
 * object into a highly performant function for request evaluation. It supports both
 * a strict schema for predefined fields and dynamic filtering for arbitrary headers and cookies.
 * @module FilterManager
 */

import {FILTERABLE_FIELDS} from './filterSchema.mjs';
import {OPERATORS, VALID_OPERATORS_BY_TYPE} from './filterOperators.mjs';

/**
 * @typedef {import('@cloudflare/workers-types').Request} Request
 */

/**
 * Defines the signature for a compiled filter function.
 * @callback FilterFn
 * @param {Request} request - The incoming request to evaluate.
 * @returns {boolean} Returns true if the request matches the filter rules.
 */

/**
 * A weak map to cache parsed cookies for the lifetime of a request object.
 * This ensures the cookie string is only parsed once per request, even if multiple
 * cookie-based filter rules are present.
 * @type {WeakMap<Request, Object<string, string>>}
 */
const cookieCache = new WeakMap();

/**
 * Parses the 'cookie' header from a request and caches the result.
 * @private
 * @param {Request} request The incoming request object.
 * @returns {Object<string, string>} A key-value map of the parsed cookies.
 */
function getCookies(request) {
    if (cookieCache.has(request)) {
        return cookieCache.get(request);
    }
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
        cookieCache.set(request, {});
        return {};
    }
    const cookies = {};
    cookieHeader.split(';').forEach(c => {
        const [key, ...value] = c.split('=');
        if (key) cookies[key.trim()] = value.join('=').trim();
    });
    cookieCache.set(request, cookies);
    return cookies;
}

/**
 * Compiles an array of filter rule groups into a single, highly performant function.
 *
 * @param {Array<object> | null | undefined} filterGroups The array of rule groups from the config.
 * @returns {FilterFn} A function that takes a request and returns true if it should be logged.
 */
function compileFilters(filterGroups) {
    if (!filterGroups || filterGroups.length === 0) {
        return () => true;
    }

    const compiledGroups = filterGroups.map(group => {
        const rules = Object.entries(group).map(([key, condition]) => {
            const operator = Object.keys(condition)[0];
            const value = condition[operator];
            let type, accessor;

            if (key.startsWith('header:')) {
                const headerName = key.substring(7);
                type = 'string';
                accessor = (req) => req.headers.get(headerName);
            } else if (key.startsWith('cookie:')) {
                const cookieName = key.substring(7);
                type = 'string';
                accessor = (req) => getCookies(req)[cookieName];
            } else {
                const field = FILTERABLE_FIELDS[key];
                if (!field) {
                    throw new Error(`[FilterCompiler] FATAL: Invalid filter field "${key}". It is not defined in the filter schema.`);
                }
                type = field.type;
                accessor = field.accessor;
            }

            if (!VALID_OPERATORS_BY_TYPE[type].has(operator)) {
                throw new Error(`[FilterCompiler] FATAL: Invalid operator "${operator}" for field "${key}" of type "${type}".`);
            }

            const operatorFn = OPERATORS[operator];
            return (request, url) => operatorFn(accessor(request, url), value);
        });

        return (request, url) => rules.every(rule => rule(request, url));
    });

    return (request) => {
        const url = new URL(request.url);
        return compiledGroups.some(group => group(request, url));
    };
}

/**
 * Parses and compiles the filter configuration.
 *
 * @param {Array<object> | null | undefined} filterConfig The filter definition array.
 * @returns {FilterFn} A compiled filter function.
 */
export function createFilter(filterConfig) {
    try {
        return compileFilters(filterConfig);
    } catch (e) {
        console.error("[FilterManager] FATAL: Could not compile filter rules.", e);
        return () => false;
    }
}