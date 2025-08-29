# Divortio D1 Logger for Cloudflare Workers

### A Simple Explanation

This project is a high-speed digital filing system for a website. Every time a visitor interacts with the site, this
system takes a detailed snapshot—what they did, where they're from, what device they used—and files it away instantly
without slowing anything down. This organized record (a "log") helps the website owner understand user behavior, improve
security, and fix problems.

### Technical Overview

This repository contains a high-performance, non-blocking logging service for the Cloudflare Workers ecosystem. Its
purpose is to receive request data via RPC, process it into a structured log entry, and persist it to a Cloudflare D1
database. The design uses a sharded Durable Object for in-memory batching to ensure high throughput and minimal database
writes, adding zero performance overhead to the calling application.

### Architectural Flow

The system uses an asynchronous, "fire-and-forget" RPC pipeline. A user-facing Worker offloads logging to this service,
which then forwards the processed log to a Durable Object for batching and persistence.

```mermaid
sequenceDiagram
    participant User
    participant App Worker
    participant Logger Worker (RPC Service)
    participant LogBatcher (Durable Object)
    participant D1 Database

    User->>+App Worker: Sends Request
    App Worker->>-Logger Worker: env.LOGGER.log(request)
    App Worker-->>-User: Sends Response (immediately)
    Logger Worker->>+LogBatcher: stub.addLog(logData)
    Note over Logger Worker, D1 Database: Log is processed asynchronously
    LogBatcher-->>-D1 Database: Writes batch of logs
```

---

### Section 3: Example Log Entry


### Example Log Entry

The following JSON object is an example of a single record as it is structured for storage.

```json
{
  "logId": "0QZ7qAbkL9xZ~_bV",
  "rayId": "8abc1234def56789-EWR",
  "fpID": "fp_a1b2c3d4e5f6g7h8",
  "deviceHash": "1234567890",
  "connectionHash": "0987654321",
  "tlsHash": "1122334455",
  "requestTime": 1724967147000,
  "receivedAt": "2025-08-29T21:12:27.000Z",
  "processedAt": "2025-08-29T21:12:27.002Z",
  "processingDurationMs": 2,
  "clientTcpRtt": 50,
  "sample10": 7,
  "sample100": 89,
  "requestUrl": "[https://example.com/api/v1/user?id=123](https://example.com/api/v1/user?id=123)",
  "requestMethod": "POST",
  "requestHeaders": "{\"host\":\"example.com\",\"user-agent\":\"Mozilla/5.0...\"}",
  "requestBody": "{\"username\":\"test\"}",
  "requestMimeType": "application/json",
  "urlDomain": "example.com",
  "urlPath": "/api/v1/user",
  "urlQuery": "?id=123",
  "headerBytes": 512,
  "bodyBytes": 18,
  "bodyTruncated": false,
  "clientIp": "203.0.113.1",
  "clientDeviceType": "desktop",
  "clientCookies": "{\"_ss_fpID\":\"fp_a1b2c3d4e5f6g7h8\"}",
  "cId": null,
  "sId": "sid_abcdef123456",
  "eId": null,
  "uID": "uid_user9876",
  "emID": null,
  "emA": null,
  "cfAsn": 13335,
  "cfAsOrganization": "Cloudflare, Inc.",
  "cfBotManagement": "{\"score\":99}",
  "cfClientAcceptEncoding": "gzip, deflate, br",
  "cfColo": "EWR",
  "cfCountry": "US",
  "cfCity": "Newark",
  "cfContinent": "NA",
  "cfHttpProtocol": "HTTP/2",
  "cfLatitude": "40.73570",
  "cfLongitude": "-74.17240",
  "cfPostalCode": "07175",
  "cfRegion": "New Jersey",
  "cfRegionCode": "NJ",
  "cfTimezone": "America/New_York",
  "cfTlsCipher": "AEAD-AES128-GCM-SHA256",
  "cfTlsVersion": "TLSv1.3",
  "cfTlsClientAuth": null,
  "geoId": "NA-US-NJ-Newark-07175",
  "threatScore": 10,
  "ja3Hash": "e7d705a3286e19ea42f587f344ee6ee5",
  "verifiedBot": false,
  "workerEnv": "{\"BATCH_INTERVAL_MS\":10000}",
  "data": "{\"abTestGroup\":\"B\"}"
}

```

---

### Section 4: Data Points Collected

### Data Points Collected

This table details every field collected by the logger, which directly corresponds to the D1 database schema.

| Name | Type | Example | Description |
| :--- | :--- | :--- | :--- |
| **logId** | `TEXT` | `0QZ7qAbkL9xZ~_bV` | A unique, time-sortable Push ID generated for each log entry. |
| **rayId** | `TEXT` | `8abc1234def56789-EWR` | The `cf-ray` header, unique to every request that goes through Cloudflare. |
| **fpID** | `TEXT` | `fp_a1b2c3d4e5f6g7h8` | A client-side generated fingerprint ID, sourced from the `_ss_fpID` cookie. |
| **deviceHash** | `TEXT` | `1234567890` | A hash of the User-Agent and TLS signature to identify the device type. |
| **connectionHash** | `TEXT` | `0987654321` | A hash of the IP, User-Agent, and TLS signature to identify a user's session. |
| **tlsHash** | `TEXT` | `1122334455` | A hash of the JA3, cipher, and random value to fingerprint the TLS connection. |
| **requestTime** | `INTEGER`| `1724967147000` | A Unix timestamp (milliseconds) of when the log processing started. |
| **receivedAt** | `DATETIME`| `2025-08-29T21:12:27.000Z` | An ISO 8601 timestamp of when the log processing started. |
| **processedAt** | `DATETIME`| `2025-08-29T21:12:27.002Z` | An ISO 8601 timestamp of when the log object was fully assembled. |
| **processingDurationMs**| `INTEGER`| `2` | The total time in milliseconds it took for the worker to assemble the log object. |
| **clientTcpRtt** | `INTEGER`| `50` | The client's TCP round-trip time to the Cloudflare edge. |
| **sample10** | `INTEGER`| `7` | A 0-9 bucket derived from the connection hash, for decile-based A/B testing. |
| **sample100** | `INTEGER`| `89` | A 0-99 bucket derived from the connection hash, for percentile-based A/B testing. |
| **requestUrl** | `TEXT` | `https://example.com/api/v1/user?id=123` | The full URL of the incoming request. |
| **requestMethod** | `TEXT` | `POST` | The HTTP method of the request (e.g., GET, POST). |
| **requestHeaders** | `TEXT` | `{"host":"example.com",...}` | A JSON string representation of all request headers. |
| **requestBody** | `TEXT` | `{"username":"test"}` | The request body, truncated to the `MAX_BODY_SIZE` configured in `wrangler.toml`. |
| **requestMimeType** | `TEXT` | `application/json` | The `content-type` of the request. |
| **urlDomain** | `TEXT` | `example.com` | The hostname from the request URL. |
| **urlPath** | `TEXT` | `/api/v1/user` | The path from the request URL. |
| **urlQuery** | `TEXT` | `?id=123` | The query string from the request URL. |
| **headerBytes** | `INTEGER`| `512` | The approximate size in bytes of the serialized request headers. |
| **bodyBytes** | `INTEGER`| `18` | The size in bytes of the original request body. |
| **bodyTruncated** | `BOOLEAN`| `false` | A boolean indicating if the logged request body was truncated. |
| **clientIp** | `TEXT` | `203.0.113.1` | The client's IP address, sourced from `x-real-ip` or `cf-connecting-ip`. |
| **clientDeviceType** | `TEXT` | `desktop` | The device type ('mobile', 'tablet', 'desktop') derived from the User-Agent. |
| **clientCookies** | `TEXT` | `{"_ss_fpID":"fp_abc",...}` | A JSON string representation of all request cookies. |
| **cId** | `TEXT` | `cid_campaign1` | A campaign or client ID, sourced from `_ss_cID` or `_cc_cID` cookies. |
| **sId** | `TEXT` | `sid_abcdef123456` | A session ID, sourced from `_ss_sID` or `_cc_sID` cookies. |
| **eId** | `TEXT` | `eid_user_login` | An event ID, sourced from `_ss_eID` or `_cc_eID` cookies. |
| **uID** | `TEXT` | `uid_user9876` | A user ID, sourced from `_ss_uID` or `_cc_uID` cookies. |
| **emID** | `TEXT` | `emid_...` | An encoded email ID, sourced from `_ss_emID` or `_cc_emID` cookies. |
| **emA** | `TEXT` | `test@example.com` | An email address, sourced from `_ss_emA` or `_cc_emA` cookies. |
| **cfAsn** | `INTEGER` | `13335` | The Autonomous System Number of the client's IP. |
| **cfAsOrganization** | `TEXT` | `Cloudflare, Inc.` | The organization associated with the ASN. |
| **cfBotManagement** | `TEXT` | `{"score":99}` | An object containing bot management scores and data. |
| **cfClientAcceptEncoding** | `TEXT` | `gzip, deflate, br` | The original `Accept-Encoding` header sent by the client. |
| **cfColo** | `TEXT` | `EWR` | The Cloudflare data center that handled the request. |
| **cfCountry** | `TEXT` | `US` | The client's country code. |
| **cfCity** | `TEXT` | `Newark` | The client's city. |
| **cfContinent** | `TEXT` | `NA` | The client's continent code. |
| **cfHttpProtocol** | `TEXT` | `HTTP/2` | The HTTP protocol version used. |
| **cfLatitude** | `TEXT` | `40.73570` | The client's latitude. |
| **cfLongitude** | `TEXT` | `-74.17240` | The client's longitude. |
| **cfPostalCode** | `TEXT` | `07175` | The client's postal code. |
| **cfRegion** | `TEXT` | `New Jersey` | The client's region. |
| **cfRegionCode** | `TEXT` | `NJ` | The client's region code. |
| **cfTimezone** | `TEXT` | `America/New_York` | The client's timezone. |
| **cfTlsCipher** | `TEXT` | `AEAD-AES128-GCM-SHA256` | The TLS cipher used for the connection. |
| **cfTlsVersion** | `TEXT` | `TLSv1.3` | The TLS version used for the connection. |
| **cfTlsClientAuth** | `TEXT` | `null` | Details about client certificate authentication. |
| **geoId** | `TEXT` | `NA-US-NJ-Newark-07175` | A concatenated string of geographic data. |
| **threatScore** | `INTEGER`| `10` | The Cloudflare threat score (0-100). |
| **ja3Hash** | `TEXT` | `e7d705a3286e...` | The client's JA3 fingerprint for identifying TLS negotiation patterns. |
| **verifiedBot** | `BOOLEAN`| `false` | A boolean indicating if the request is from a known good bot. |
| **workerEnv** | `TEXT` | `{"BATCH_...":10000}` | A JSON string of non-secret environment variables from `wrangler.toml`. |
| **data** | `TEXT` | `{"abTestGroup":"B"}` | A JSON string of any custom data object passed with the `log()` call. |

### Cloudflare UI Deployment

This project is designed for deployment via a forked GitHub repository.

#### 1. Fork the Repository

Fork this repository to your own GitHub account.

#### 2. Create the D1 Database

* Navigate to **Workers & Pages** > **D1** in the Cloudflare Dashboard.
* Click **Create database**, name it (e.g., `production-logs`), and copy the **Database ID**.

#### 3. Deploy the Worker

* Navigate to **Workers & Pages** and click **Create application** > **Connect to Git**.
* Choose your forked repository. Cloudflare will detect the `wrangler.toml` file.
* Under **Variables**, add the `LOGGING_DB` binding (D1 Database) and the environment variables (`BATCH_INTERVAL_MS`,
  etc.).
* Under **Durable Objects**, add the `LOG_BATCHER` binding.
* Click **Save and Deploy**.

#### 4. Run the Database Migration

* Navigate to your newly deployed worker's dashboard.
* Go to the **D1** tab and click **Apply migrations** to create the `RequestLogs` table.

### Configuration

Configuration is managed via environment variables in the `wrangler.toml` file.

```toml

[vars]
BATCH_INTERVAL_MS = 10000
MAX_BATCH_SIZE = 200
MAX_BODY_SIZE = 10240
```

---

### Section 7: Usage


### Usage

1.  **Add Service Binding**: In your application worker's `wrangler.toml`, bind this logging worker.
    ```toml
    [[services]]
    binding = "LOGGER"
    service = "divortio-logdo"
    ```

2.  **Call via RPC**: Use the binding to call the `log` method from your application code.
    ```javascript
    export default {
      async fetch(request, env, ctx) {
        // Basic logging
        env.LOGGER.log(request);

        // Logging with custom data
        const customData = { transactionId: "xyz-123" };
        env.LOGGER.log(request, customData);
        
        return new Response("OK");
      }
    }
    ```

