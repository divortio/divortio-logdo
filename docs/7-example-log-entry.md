# 7. Example Log Entry

While the [Data Schema](./3-data-schema.md) documentation details every individual field, it can be helpful to see what
a complete, structured log object looks like. The following JSON object is an example of a single record as it is
processed and stored by the logger.

This example includes a wide range of data points, from basic request information to detailed Cloudflare security and
performance metrics.

---

### Sample Log Object

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