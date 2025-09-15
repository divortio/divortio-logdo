/**
 * @file /build/buildRoutes.js
 * @description This build script handles the optional user-defined log routing configuration.
 * It copies the content from `_userLogRoutes.mjs` (if it exists) at the project root
 * to `src/userLogRoutes.mjs`, where it can be statically imported by the application.
 */
// sdfsdf
import fs from 'fs';
import path from 'path';

// Define the source and destination paths for the configuration files.
const userConfigPath = path.resolve(process.cwd(), '_userLogRoutes.mjs');
const appConfigPath = path.resolve(process.cwd(), 'src/routes/userLogRoutes.mjs');
const defaultConfigPath = path.resolve(process.cwd(), 'src/routes/defaultLogRoutes.mjs');

try {
    // Check if the user-defined configuration file exists at the root.
    if (fs.existsSync(userConfigPath)) {
        console.log('[Build] User-defined `_userLogRoutes.mjs` found. Applying configuration...');
        // If it exists, copy its content to the application source directory.
        fs.copyFileSync(userConfigPath, appConfigPath);
    } else {
        console.log('[Build] No `_userLogRoutes.mjs` found. Using default empty configuration.');
        // If it doesn't exist, use the default (empty) configuration.
        fs.copyFileSync(defaultConfigPath, appConfigPath);
    }
    console.log('[Build] Log route configuration complete.');
} catch (error) {
    console.error('[Build] FATAL: Failed to configure log routes.', error);
    // Exit with an error code to halt the build/deploy process.
    process.exit(1);
}