/**
 * @file src/filterOperators.mjs
 * @description Defines the supported filter operators and their execution logic. This module
 * provides a clear, extendable, and type-aware system for all comparisons.
 * @module FilterOperators
 */

/**
 * A map of all supported filter operators and their corresponding execution functions.
 * Each function is designed to handle a specific data type.
 *
 * @property {function(any, any): boolean} equals - Strict equality check for strings, numbers, and booleans.
 * @property {function(string, string): boolean} contains - Substring check for strings.
 * @property {function(string, string): boolean} startsWith - Prefix check for strings.
 * @property {function(string, string): boolean} endsWith - Suffix check for strings.
 * @property {function(number, number): boolean} greaterThan - Checks if the first number is greater than the second.
 * @property {function(number, number): boolean} lessThan - Checks if the first number is less than the second.
 * @property {function(any): boolean} exists - Checks if a value is not null or undefined.
 * @property {function(any): boolean} doesNotExist - Checks if a value is null or undefined.
 */
export const OPERATORS = {
    // --- Universal Operators ---
    exists: (subject) => subject !== null && subject !== undefined,
    doesNotExist: (subject) => subject === null || subject === undefined,

    // --- Type-Specific Operators ---
    equals: (subject, value) => subject === value,
    contains: (subject, value) => typeof subject === 'string' && subject.includes(value),
    startsWith: (subject, value) => typeof subject === 'string' && subject.startsWith(value),
    endsWith: (subject, value) => typeof subject === 'string' && subject.endsWith(value),
    greaterThan: (subject, value) => typeof subject === 'number' && subject > value,
    lessThan: (subject, value) => typeof subject === 'number' && subject < value,
};

/**
 * A map that defines which operators are valid for each data type.
 * This is used by the filter compiler for strict validation.
 * @type {Object<string, Set<string>>}
 */
export const VALID_OPERATORS_BY_TYPE = {
    string: new Set(['equals', 'contains', 'startsWith', 'endsWith', 'exists', 'doesNotExist']),
    number: new Set(['equals', 'greaterThan', 'lessThan', 'exists', 'doesNotExist']),
    boolean: new Set(['equals', 'exists', 'doesNotExist']),
};