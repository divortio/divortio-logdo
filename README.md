
# Divortio D1 Logger for Cloudflare Workers

**A production-grade, high-performance logging solution for Cloudflare Workers, written in standard JavaScript.**


A "fire-and-forget" logging system that captures over 50 data points per request, enriches them with advanced security
signals, and writes them to a D1 database—all with zero performance impact on your user-facing applications.



---

## 🚀 Features

* **Comprehensive Data Capture**: Logs a rich dataset for every request, including client details, connection info, and
  geolocation.
* **Enriched Security Signals**: Uses Transform Rules to capture advanced security data like **Threat Score** and **JA3
  Hash**.
* **Flexible Custom Data**: Includes an optional `data` field to log any arbitrary, application-specific JSON object.
* **Zero Latency**: The "fire-and-forget" RPC architecture ensures that logging never blocks or slows down the response
  to the user.
* **Extremely Scalable**: Employs a sharded Durable Object for intelligent, high-throughput log batching.
* **Modern RPC**: Uses the `WorkerEntrypoint` class for a robust and explicit RPC server implementation.
* **Automatic Migrations**: `wrangler.toml` is configured for automatic D1 database schema migrations.

---

## 🏛️ Architecture Overview

This system is composed of two primary workers: your main application worker and this logging worker. They communicate
privately on Cloudflare's network using an RPC-like Service Binding.

**Request Flow:**
`User` -> `Your App Worker` -> (RPC Call) -> `Logger Worker` -> `LogBatcher Durable Object` -> (Batch Write)
-> `D1 Database`

1. **App Worker**: Your primary application receives the user's request. Its only job is to make a non-blocking RPC call
   to the `Logger Worker`.
2. **Logger Worker**: Receives the request object via RPC. It compiles the comprehensive log data and forwards it to the
   correct Durable Object shard.
3. **LogBatcher Durable Object**: A stateful object that collects logs in-memory for a short period (e.g., 10 seconds).
4. **D1 Database**: The Durable Object writes the entire batch of logs to the database in a single, efficient
   transaction.

---

## Data Points Collected


| Goal | Header Name | Value (Expression) |
| :--- | :--- | :--- |
| **Set Metal ID** | `X-CF-Metal-ID` | `cf.metal.id` |
| **Set Client IP** | `X-CF-Client-IP` | `ip.src` |
| **Set Threat Score** | `X-CF-Threat-Score` | `to_string(cf.threat_score)` |
| **Set JA3 Hash** | `X-CF-JA3-Hash` | `cf.ja3_hash` |
| **Set Verified Bot** | `X-CF-Verified-Bot` | `cf.bot_management.verified_bot` |
| **Set WAF Score** | `X-CF-WAF-Score` | `to_string(cf.waf.score)` |
| **Set Edge IP** | `X-CF-Edge-IP` | `cf.edge.server_ip` |
| **Set Edge Port** | `X-CF-Edge-Port` | `to_string(cf.edge.server_port)` |
| **Set Client Port** | `X-CF-Client-Port` | `to_string(cf.edge.client_port)` |
| **Set Zone Name** | `X-CF-Zone-Name` | `cf.zone.name` |
| **Edge Request
Timestamp** | `X-Request-Time` | `concat(to_string(http.request.timestamp.sec), to_string(http.request.timestamp.msec))` |
| **Human-Readable Threat
Category**| `X-CF-Threat-Category`| `if(cf.threat_score > 80, "Critical", if(cf.threat_score > 50, "High", if(cf.threat_score > 20, "Medium", "Low")))` |
| **Set Device
Type** | `X-Device-Type` | `if(lower(http.user_agent) matches "(?:phone|windows\\s+phone|ipod|blackberry|(?:android|bb\\d+|meego|silk|googlebot) .+? mobile|palm|windows\\s+ce|opera mini|avantgo|mobilesafari|docomo|kaios)", "mobile", if(lower(http.user_agent) matches "(?:ipad|playbook|(?:android|bb\\d+|meego|silk)(?! .+? mobile))", "tablet", "desktop"))` |
| **TLS
Fingerprint** | `X-CF-TLS-Hash` | `to_string(crc32(concat(cf.bot_management.ja3_hash, cf.tls_cipher, cf.tls_client_random)))` |
| **Device
Fingerprint** | `X-CF-Device-Hash` | `to_string(crc32(concat(http.user_agent, cf.bot_management.ja3_hash, cf.tls_cipher)))` |
| **Session
Fingerprint** | `X-CF-Session-Hash` | `to_string(crc32(concat(ip.src, http.user_agent, cf.bot_management.ja3_hash, cf.tls_cipher)))` |
| **Extract Colo from Ray ID** | `X-CF-Colo` | `substring(cf.ray_id, -3)` |
| **Server Identifier** | `X-CF-Server-ID` | `concat(substring(cf.ray_id, -3), cf.metal.id)` |
| **Protocol Fingerprint** | `X-CF-Protocol-Hash` | `to_string(crc32(concat(http.request.version, cf.tls_cipher)))` |
| **Geographic
Identifier** | `X-CF-Geo-ID` | `concat(ip.src.continent, "-", ip.src.country, "-", ip.src.region_code, "-", ip.src.city, "-", ip.src.postal_code)` |
| **Decile Bucket (
0-9)** | `X-CF-Session-Bin10` | `substring(to_string(crc32(to_string(crc32(concat(ip.src, http.user_agent, cf.bot_management.ja3_hash, cf.tls_cipher))))), -1)` |
| **Percentile Bucket (
0-99)** | `X-CF-Session-Bin100` | `substring(to_string(crc32(to_string(crc32(concat(ip.src, http.user_agent, cf.bot_management.ja3_hash, cf.tls_cipher))))), -2)` |
| **Set Request Domain** | `X-URL-Domain` | `http.host` |
| **Set Request Path** | `X-URL-Path` | `http.request.uri.path` |
| **Set Request Query String** | `X-URL-Query` | `http.request.uri.query` |
| **Parse Cookie `_ss_cID`** | `X-cID` | `http.request.cookies["_ss_cID"]` |
| **Parse Cookie `_ss_sID`** | `X-sID` | `http.request.cookies["_ss_sID"]` |
| **Parse Cookie `_ss_eID`** | `X-eID` | `http.request.cookies["_ss_eID"]` |

---


## ☁️ Cloudflare UI Deployment (Connect to Git)

This project is designed to be deployed directly from your GitHub repository using the Cloudflare dashboard.

### Step 1: Fork the Repository

First, ensure you have forked this repository (`https://github.com/divortio/divortio-worker-d1-logger`) to your own
GitHub account.

### Step 2: Create the D1 Database

1. In the Cloudflare Dashboard, navigate to **Workers & Pages** > **D1**.
2. Click **Create database**, give it a name (e.g., `production-logs`), and create it.
3. Copy the **Database ID**. You will need this for the next step.

### Step 3: Deploy the Worker

1. In the Cloudflare Dashboard, navigate to **Workers & Pages** and click **Create application**.
2. Select the **Connect to Git** option.
3. Choose your forked repository and click **Begin setup**.
4. Cloudflare will detect the `wrangler.toml` file.
    * **Project Name**: `divortio-worker-d1-logger` (or as desired).
    * **Production Branch**: `main`.
5. Navigate to the **Variables** section to add your D1 database binding:
    * Click **Add binding**.
    * **Binding type**: D1 Database.
    * **Binding name**: `LOGGING_DB` (this must match the name in `wrangler.toml`).
    * **D1 database**: Select the `production-logs` database you created.
6. Navigate to the **Durable Objects** section:
    * Click **Add binding**.
    * **Binding name**: `LOG_BATCHER`.
    * **Class name**: `LogBatcher`.
7. Click **Save and Deploy**. Cloudflare will now build and deploy your worker.

### Step 4: Run the Database Migration

After the first deployment, you must apply the database schema.

1. Navigate to your newly deployed worker in the Cloudflare dashboard.
2. Go to the **D1** tab.
3. The UI will show that you have unapplied migrations. Click **Apply migrations** to create and update
   the `RequestLogs` table.

---

## ⚙️ Configuration

### Transform Rule for Data Enrichment (Required)

To capture the full range of security and edge data, you must create **one** "Modify Request Header" Transform Rule.

1. Go to your Cloudflare dashboard and select your domain.
2. Navigate to **Rules -> Transform Rules**.
3. Click **Create transform rule** and select **Modify Request Header**.
4. Give your rule a name: `[Logging] Enrich Request Data`.
5. Under **Then...**, add the following headers:

| Action | Header Name | Value (Expression) |
| :--- | :--- | :--- |
| Set dynamic | `X-CF-Metal-ID` | `cf.metal.id` |
| Set dynamic | `X-CF-Threat-Score` | `to_string(cf.threat_score)` |
| Set dynamic | `X-CF-JA3-Hash` | `cf.ja3_hash` |
| Set dynamic | `X-CF-Verified-Bot` | `cf.bot_management.verified_bot` |
| Set dynamic | `X-CF-WAF-Score` | `to_string(cf.waf.score)` |
| Set dynamic | `X-CF-Edge-IP` | `cf.edge.server_ip` |
| Set dynamic | `X-CF-Edge-Port` | `to_string(cf.edge.server_port)` |
| Set dynamic | `X-CF-Client-Port` | `to_string(cf.edge.client_port)` |
| Set dynamic | `X-CF-Zone-Name` | `cf.zone.name` |

6. Click **Deploy**.

---

## 🔌 Usage

To use the logger from another worker:

1. In the `wrangler.toml` of your *other* worker, add a service binding:
   ```toml
   [[services]]
   binding = "LOGGER"
   service = "divortio-worker-d1-logger" # The name of this logging worker
   ```
2. In your other worker's code, you can now call the logger.

   ```javascript
   /**
    * @typedef {object} LoggerService
    * @property {(request: Request, data?: object) => void} log
    */

   /**
    * @typedef {object} Env
    * @property {LoggerService} LOGGER
    */

   export default {
       /**
        * @param {Request} request
        * @param {Env} env
        * @param {ExecutionContext} ctx
        */
       async fetch(request, env, ctx) {
           // Example 1: Basic logging
           env.LOGGER.log(request);

           // Example 2: Logging with custom application data
           const customData = {
               userId: "user-12345",
               abTestGroup: "B",
               cartId: "c_abc-def-ghi"
           };
           env.LOGGER.log(request, customData);

           // ... your logic
           return new Response("OK");
       }
   }
   ```

---

## 📄 License

This project is licensed under the MIT License.