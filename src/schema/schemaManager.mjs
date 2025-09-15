/**
 * @file src/schemaManager.mjs
 * @description Manages the D1 database schema programmatically. This module is the single
 * source of truth for all schema-related operations, including creation, alteration, and versioning.
 * @module SchemaManager
 */

/**
 * Initializes the database by checking the schema version and applying migrations if necessary.
 * This is the primary public function to be called by the Durable Object.
 *
 * @param {object} env The worker's environment bindings.
 * @param {string | undefined} storedHash The schema hash currently stored in the Durable Object's storage.
 * @param {object} route The logRoute object containing the specific schema for the table.
 * @returns {Promise<string>} A promise that resolves with the current, successfully applied schema hash.
 */
export async function initDB(env, storedHash, route) {
    if (storedHash !== route.schemaHash) {
        console.log(`[SchemaManager] Schema hash mismatch for table "${route.tableName}". Stored: ${storedHash}, Current: ${route.schemaHash}. Applying changes...`);
        await applySchema(env.LOGGING_DB, route.tableName, route.schema);
    }
    return route.schemaHash;
}

/**
 * A wrapper for database execution that provides detailed error logging.
 * If a statement fails, it logs the statement and error, then crashes the process.
 *
 * @private
 * @param {D1Database} db The D1 database binding.
 * @param {string | D1PreparedStatement | (string | D1PreparedStatement)[]} statement The SQL statement(s) to execute.
 */
async function executeOrCrash(db, statement) {
    try {
        if (Array.isArray(statement)) {
            await db.batch(statement);
        } else if (typeof statement === 'string') {
            await db.exec(statement);
        } else {
            await statement.run();
        }
    } catch (e) {
        console.error(`[SchemaManager] FATAL: A critical database migration failed.`, {
            error: e.message,
            statement: JSON.stringify(statement),
        });
        // Re-throw the error to halt the Durable Object's initialization.
        throw e;
    }
}

/**
 * Ensures the database table exists and its schema is up-to-date.
 * @private
 * @param {D1Database} db The D1 database binding.
 * @param {string} tableName The name of the table to manage.
 * @param {object} schema The schema definition from the compiled log route.
 * @returns {Promise<void>}
 */
async function applySchema(db, tableName, schema) {
    const tableCheck = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(tableName).first();

    if (!tableCheck) {
        await createTable(db, tableName, schema);
    } else {
        await updateTableAndIndexes(db, tableName, schema);
    }
}

/**
 * Creates a new table and all its defined indexes.
 * @private
 * @param {D1Database} db The D1 database binding.
 * @param {string} tableName The name of the table to create.
 * @param {object} schema The schema definition object.
 * @returns {Promise<void>}
 */
async function createTable(db, tableName, schema) {
    console.log(`[SchemaManager] Table "${tableName}" not found. Creating...`);
    const columns = Object.entries(schema).map(([name, props]) => {
        return `${name} ${props.type} ${props.constraints || ''}`.trim();
    }).join(', ');

    const createTableStmt = `CREATE TABLE ${tableName} (${columns});`;
    await executeOrCrash(db, createTableStmt);
    console.log(`[SchemaManager] Table "${tableName}" created successfully.`);

    await createMissingIndexes(db, tableName, schema, new Set());
}

/**
 * Checks for and applies missing columns and indexes to an existing table.
 * @private
 * @param {D1Database} db The D1 database binding.
 * @param {string} tableName The name of the table to update.
 * @param {object} schema The schema definition object.
 * @returns {Promise<void>}
 */
async function updateTableAndIndexes(db, tableName, schema) {
    console.log(`[SchemaManager] Verifying schema for table "${tableName}"...`);

    const existingColumns = await db.prepare(`PRAGMA table_info(${tableName})`).all();
    const existingColumnNames = new Set(existingColumns.results.map(col => col.name));
    const columnsToAdd = Object.entries(schema).filter(([name]) => !existingColumnNames.has(name));

    if (columnsToAdd.length > 0) {
        console.log(`[SchemaManager] Adding ${columnsToAdd.length} missing columns to "${tableName}".`);
        const alterStmts = columnsToAdd.map(([name, props]) => {
            const columnDef = `${name} ${props.type} ${props.constraints || ''}`.trim();
            return db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
        });
        await executeOrCrash(db, alterStmts);
    }

    const existingIndexes = await db.prepare(`PRAGMA index_list(${tableName})`).all();
    const existingIndexNames = new Set(existingIndexes.results.map(idx => idx.name));
    await createMissingIndexes(db, tableName, schema, existingIndexNames);

    console.log(`[SchemaManager] Table "${tableName}" schema is up-to-date.`);
}

/**
 * Creates indexes defined in the schema that do not already exist in the database.
 * @private
 * @param {D1Database} db The D1 database binding.
 * @param {string} tableName The name of the table.
 * @param {object} schema The schema definition object.
 * @param {Set<string>} existingIndexNames A set of index names that already exist.
 * @returns {Promise<void>}
 */
async function createMissingIndexes(db, tableName, schema, existingIndexNames) {
    const indexesToCreate = Object.entries(schema)
        .filter(([, props]) => props.indexed)
        .map(([name]) => ({name: `idx_${name}`, column: name}))
        .filter(index => !existingIndexNames.has(index.name));

    if (indexesToCreate.length === 0) {
        return;
    }

    console.log(`[SchemaManager] Creating ${indexesToCreate.length} missing indexes on "${tableName}".`);
    const indexStmts = indexesToCreate.map(index => {
        return db.prepare(`CREATE INDEX IF NOT EXISTS ${index.name} ON ${tableName} (${index.column});`);
    });

    await executeOrCrash(db, indexStmts);
}