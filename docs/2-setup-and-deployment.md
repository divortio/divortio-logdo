# 2. Setup and Deployment

This guide provides a complete walkthrough for setting up and deploying the Divortio D1 Logger service. This document
covers two primary deployment methods: using the `wrangler` CLI (recommended for most users) and connecting your GitHub
repository directly in the Cloudflare UI.

---

### Prerequisites

Before you begin, you will need:

* A Cloudflare account.
* A forked version of this GitHub repository.
* The `wrangler` CLI installed and authenticated (for the CLI deployment method).

---

### Step 1: Create Cloudflare Resources

The logger requires three core Cloudflare resources: a **D1 Database** for storing logs and two **KV Namespaces** for
state management and error handling.

#### A. Create the D1 Database

1. Navigate to **Workers & Pages** > **D1** in the Cloudflare Dashboard.
2. Click **Create database**.
3. Name the database (e.g., `production-logs`) and select a location.
4. Once created, copy the **Database ID**. You will need this for configuration.

#### B. Create the KV Namespaces

1. Navigate to **Workers & Pages** > **KV** in the Cloudflare Dashboard.
2. Click **Create a namespace** and enter the name `LOGDO_STATE`.
3. Repeat the process to create a second namespace named `LOGDO_DEAD_LETTER`.
4. For each namespace, copy its **ID**. You will need these for configuration.

---

### Deployment Method 1: Using Wrangler CLI (Recommended)

This is the fastest and most common way to deploy the worker.

#### A. Configure `wrangler.toml`

Open the `wrangler.toml` file in the root of your forked repository and update it with the resource IDs you just
created.

```toml
# wrangler.toml

# ... (other settings)

[[d1_databases]]
binding = "LOGGING_DB"
database_name = "production-logs"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" # <-- PASTE YOUR D1 DATABASE ID HERE

# ====================================================================================
# KV Namespace Bindings
# ====================================================================================
[[kv_namespaces]]
binding = "LOGDO_STATE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" # <-- PASTE YOUR LOGDO_STATE KV ID HERE

[[kv_namespaces]]
binding = "LOGDO_DEAD_LETTER"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" # <-- PASTE YOUR LOGDO_DEAD_LETTER KV ID HERE

# ... (other settings)
```

#### B. Deploy the Worker

Once your `wrangler.toml` file is configured, deploy the worker from your terminal.

```bash
npx wrangler deploy
```

---

### Deployment Method 2: Cloudflare UI (Git-based)

This method is useful if you prefer to manage deployments directly from the Cloudflare dashboard.

1. Navigate to **Workers & Pages** in the Cloudflare dashboard.
2. Click **Create application** and select the **Pages** tab.
3. Click **Connect to Git** and choose your forked repository.
4. In the build settings, configure your project as needed (the defaults are usually sufficient).
5. Navigate to your new project's **Settings** > **Functions** > **Durable Object Bindings** and add a new binding:
    * **Binding name**: `LOG_BATCHER`
    * **Class name**: `LogBatcher`
6. Navigate to **Settings** > **Functions** > **KV namespace bindings** and add two new bindings:
    * **Variable name**: `LOGDO_STATE`, **KV namespace**: `LOGDO_STATE`
    * **Variable name**: `LOGDO_DEAD_LETTER`, **KV namespace**: `LOGDO_DEAD_LETTER`
7. Navigate to **Settings** > **Functions** > **D1 database bindings** and add a new binding:
    * **Variable name**: `LOGGING_DB`, **D1 database**: `production-logs`
8. Click **Save and Deploy**.

---

### Step 4: Using the Logger in a Parent Worker

To use the logging service, you must create a **Service Binding** in any "parent" worker that needs to log requests.

1. In your parent worker's `wrangtoml` file, add the following `[[services]]` block:

   ```toml
   [[services]]
   binding = "LOGGER" # This is the variable name you will use in your code (e.g., env.LOGGER)
   service = "divortio-logdo" # This must match the name of your deployed logging worker
   ```

2. In your parent worker's code, you can now log requests using either the RPC `log()` method or the `fetch()` handler.

   **Example: Using the `fetch()` handler**
   ```javascript
   export default {
     async fetch(request, env, ctx) {
       // Forward the request to the logger and continue
       ctx.waitUntil(env.LOGGER.fetch(request));

       // ... your worker's main logic
       return new Response("Hello World!");
     }
   };
   ```

---