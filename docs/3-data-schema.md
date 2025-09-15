# 3. Data Schema and Collected Points

This document details every field collected by the logger. This "master schema" is the single source of truth for the
database table structure and corresponds directly to the `tableSchema` object defined in `src/schema/schema.mjs`.

When using the log routing and filtering features, you can create tables with a subset of these columns, but all fields
are available for use.

---

### Master Schema Definition

| Name | Type | Indexed | Description |
| :--- | :--- | :--- | :--- |
| **logId** | `TEXT` | No | A unique, time-sortable Push ID generated for each log entry. Primary Key. |
| **rayId** | `TEXT` | Yes | The `cf-ray` header, unique to every request that goes through Cloudflare. |
| **fpID** | `TEXT` | Yes | A client-side generated fingerprint ID, often sourced from a cookie. |
| **deviceHash** | `TEXT` | No | A hash of the User-Agent and TLS signature to identify the device type. |
| **connectionHash** | `TEXT` | Yes | A hash of the IP, User-Agent, and TLS signature to identify a user session. |
| **tlsHash** | `TEXT` | No | A hash of the JA3, cipher, and other TLS data to fingerprint the connection. |
| **requestTime** | `INTEGER`| No | A Unix timestamp (in milliseconds) of when the log processing started. |
| **receivedAt** | `DATETIME`| Yes | An ISO 8601 timestamp of when the log processing started. |
| **processedAt** | `DATETIME`| No | An ISO 8601 timestamp of when the log object was fully assembled. |
| **
processingDurationMs**| `INTEGER`| No | The total time in milliseconds it took for the worker to assemble the log object. |
| **clientTcpRtt** | `INTEGER`| No | The client's TCP round-trip time to the Cloudflare edge. |
| **sample10** | `INTEGER`| No | A 0-9 bucket derived from the connection hash, for decile-based A/B testing. |
| **sample100** | `INTEGER`| No | A 0-99 bucket derived from the connection hash, for percentile-based A/B testing. |
| **requestUrl** | `TEXT` | No | The full URL of the incoming request. |
| **requestMethod** | `TEXT` | No | The HTTP method of the request (e.g., GET, POST). |
| **requestHeaders** | `TEXT` | No | A JSON string representation of all request headers. |
| **requestBody** | `TEXT` | No | The request body, truncated to the `MAX_BODY_SIZE` configured in `wrangler.toml`. |
| **requestMimeType** | `TEXT` | No | The `content-type` of the request. |
| **urlDomain** | `TEXT` | No | The hostname from the request URL. |
| **urlPath** | `TEXT` | No | The path from the request URL. |
| **urlQuery** | `TEXT` | No | The query string from the request URL. |
| **headerBytes** | `INTEGER`| No | The approximate size in bytes of the serialized request headers. |
| **bodyBytes** | `INTEGER`| No | The size in bytes of the original request body before truncation. |
| **bodyTruncated** | `BOOLEAN`| No | A boolean indicating if the logged request body was truncated. |
| **clientIp** | `TEXT` | No | The client's IP address. |
| **clientDeviceType** | `TEXT` | No | The device type ('mobile', 'tablet', 'desktop') derived from the User-Agent. |
| **clientCookies** | `TEXT` | No | A JSON string representation of all request cookies. |
| **cId** | `TEXT` | No | A campaign or client ID, typically sourced from a cookie. |
| **sId** | `TEXT` | No | A session ID, typically sourced from a cookie. |
| **eId** | `TEXT` | No | An event ID, typically sourced from a cookie. |
| **uID** | `TEXT` | No | A user ID, typically sourced from a cookie. |
| **emID** | `TEXT` | No | An encoded email ID, typically sourced from a cookie. |
| **emA** | `TEXT` | No | An email address, typically sourced from a cookie. |
| **cfAsn** | `INTEGER` | No | The Autonomous System Number of the client's IP. |
| **cfAsOrganization** | `TEXT` | No | The organization associated with the ASN. |
| **cfBotManagement** | `TEXT` | No | A JSON string containing bot management scores and data. |
| **cfClientAcceptEncoding** | `TEXT` | No | The original `Accept-Encoding` header sent by the client. |
| **cfColo** | `TEXT` | No | The Cloudflare data center that handled the request. |
| **cfCountry** | `TEXT` | No | The client's country code. |
| **cfCity** | `TEXT` | No | The client's city. |
| **cfContinent** | `TEXT` | No | The client's continent code. |
| **cfHttpProtocol** | `TEXT` | No | The HTTP protocol version used. |
| **cfLatitude** | `TEXT` | No | The client's latitude. |
| **cfLongitude** | `TEXT` | No | The client's longitude. |
| **cfPostalCode** | `TEXT` | No | The client's postal code. |
| **cfRegion** | `TEXT` | No | The client's region or state. |
| **cfRegionCode** | `TEXT` | No | The client's region or state code. |
| **cfTimezone** | `TEXT` | No | The client's timezone. |
| **cfTlsCipher** | `TEXT` | No | The TLS cipher used for the connection. |
| **cfTlsVersion** | `TEXT` | No | The TLS version used for the connection. |
| **cfTlsClientAuth** | `TEXT` | No | A JSON string with details about client certificate authentication. |
| **geoId** | `TEXT` | Yes | A concatenated string of geographic data for easy filtering. |
| **threatScore** | `INTEGER`| No | The Cloudflare threat score (0-100). |
| **ja3Hash** | `TEXT` | No | The client's JA3 fingerprint for identifying TLS negotiation patterns. |
| **verifiedBot** | `BOOLEAN`| No | A boolean indicating if the request is from a known good bot. |
| **workerEnv** | `TEXT` | No | A JSON string of non-secret environment variables from `wrangler.toml`. |
| **data** | `TEXT` | No | A JSON string of any custom data object passed with the `log()` call. |