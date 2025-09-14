# Example: Parent Worker Setup

This directory contains an example of how to configure and use the `divortio-logdo` service from a separate "parent"
Cloudflare Worker.

### Files

* `wrangler.toml`: An example configuration file for the parent worker. The most important part is the `[[services]]`
  section, which creates the service binding to the logger.
* `src/index.mjs`: The example worker code. It demonstrates how to use the `LOGGER` binding to call the `log()`
  and `getLogData()` RPC methods.

### How It Works

1. The `wrangler.toml` file establishes a **Service Binding**, making the deployed `divortio-logdo` worker available
   inside this parent worker under the name `LOGGER`.
2. The `src/index.mjs` file accesses this binding via `env.LOGGER`.
3. It then makes RPC calls like `env.LOGGER.log(request)` to send logging data to the service without blocking the
   response to the end-user.