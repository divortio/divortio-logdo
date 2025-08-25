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