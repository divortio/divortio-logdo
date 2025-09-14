
# Divortio D1 Logger for Cloudflare Workers

**A production-grade, high-performance logging solution for Cloudflare Workers, written in standard JavaScript.**


A "fire-and-forget" logging system that captures over 50 data points per request, enriches them with advanced security
signals, and writes them to a D1 database—all with zero performance impact on your user-facing applications.



### Transform Rule for Data Enrichment (Optional)

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
