/**
 * @file src/filterSchema.mjs
 * @description Defines the master schema of all fields that are allowed to be used
 * in the log routing pipeline. This acts as a strict, fully-typed allowlist for
 * compile-time validation.
 * @module FilterSchema
 */

/**
 * The master schema of all filterable fields. Each key is the dot-notation field name
 * used in the user's configuration. The filter compiler uses this schema to validate
 * routes and generate high-performance accessor functions.
 *
 * @property {string} type - The data type of the field ('string', 'number', 'boolean').
 * @property {function(Request, URL): any} accessor - A high-performance function to extract the field's value from a request.
 */
export const FILTERABLE_FIELDS = {
    // --- Request Method ---
    'request.method': {type: 'string', accessor: (req) => req.method},
    'request.redirect': {type: 'string', accessor: (req) => req.redirect},

    // --- Header Fields ---
    'header.accept': {type: 'string', accessor: (req) => req.headers.get('accept')},
    'header.content-type': {type: 'string', accessor: (req) => req.headers.get('content-type')},
    'header.user-agent': {type: 'string', accessor: (req) => req.headers.get('user-agent')},
    'header.referer': {type: 'string', accessor: (req) => req.headers.get('referer')},
    'header.cf-ray': {type: 'string', accessor: (req) => req.headers.get('cf-ray')},
    'header.cf-ipcountry': {type: 'string', accessor: (req) => req.headers.get('cf-ipcountry')},
    'header.cf-connecting-ip': {type: 'string', accessor: (req) => req.headers.get('cf-connecting-ip')},
    'header.x-forwarded-for': {type: 'string', accessor: (req) => req.headers.get('x-forwarded-for')},

    // --- URL Fields ---
    'url.hostname': {type: 'string', accessor: (req, url) => url.hostname},
    'url.pathname': {type: 'string', accessor: (req, url) => url.pathname},
    'url.search': {type: 'string', accessor: (req, url) => url.search},

    // --- Cloudflare (cf) Object Fields ---
    'cf.asn': {type: 'number', accessor: (req) => req.cf?.asn},
    'cf.asOrganization': {type: 'string', accessor: (req) => req.cf?.asOrganization},
    'cf.clientTcpRtt': {type: 'number', accessor: (req) => req.cf?.clientTcpRtt},
    'cf.colo': {type: 'string', accessor: (req) => req.cf?.colo},
    'cf.continent': {type: 'string', accessor: (req) => req.cf?.continent},
    'cf.country': {type: 'string', accessor: (req) => req.cf?.country},
    'cf.city': {type: 'string', accessor: (req) => req.cf?.city},
    'cf.region': {type: 'string', accessor: (req) => req.cf?.region},
    'cf.regionCode': {type: 'string', accessor: (req) => req.cf?.regionCode},
    'cf.postalCode': {type: 'string', accessor: (req) => req.cf?.postalCode},
    'cf.timezone': {type: 'string', accessor: (req) => req.cf?.timezone},
    'cf.latitude': {type: 'string', accessor: (req) => req.cf?.latitude},
    'cf.longitude': {type: 'string', accessor: (req) => req.cf?.longitude},
    'cf.httpProtocol': {type: 'string', accessor: (req) => req.cf?.httpProtocol},
    'cf.requestPriority': {type: 'string', accessor: (req) => req.cf?.requestPriority},
    'cf.tlsCipher': {type: 'string', accessor: (req) => req.cf?.tlsCipher},
    'cf.tlsVersion': {type: 'string', accessor: (req) => req.cf?.tlsVersion},
    'cf.clientAcceptEncoding': {type: 'string', accessor: (req) => req.cf?.clientAcceptEncoding},
    'cf.tlsClientAuth.certVerified': {type: 'string', accessor: (req) => req.cf?.tlsClientAuth?.certVerified},
    'cf.threatScore': {type: 'number', accessor: (req) => req.cf?.threatScore},

    // --- Nested Bot Management Fields ---
    'cf.botManagement.score': {type: 'number', accessor: (req) => req.cf?.botManagement?.score},
    'cf.botManagement.verifiedBot': {type: 'boolean', accessor: (req) => req.cf?.botManagement?.verifiedBot},
    'cf.botManagement.ja3Hash': {type: 'string', accessor: (req) => req.cf?.botManagement?.ja3Hash},
    'cf.botManagement.corporateProxy': {type: 'boolean', accessor: (req) => req.cf?.botManagement?.corporateProxy},
};