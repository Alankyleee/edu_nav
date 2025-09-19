// Vercel Serverless Function: GET /api/admin_list
// Returns submissions from Cloudflare KV (paginated). Requires x-admin-token header.

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendCORS(res, 204);
    if (req.method !== 'GET') return sendJSON(res, 405, { error: 'Method Not Allowed' });

    if (!checkAdmin(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    const accountId = process.env.CF_ACCOUNT_ID;
    const namespaceId = process.env.CF_KV_NAMESPACE_ID;
    const token = process.env.CF_API_TOKEN;
    const prefix = process.env.CF_KV_PREFIX || 'submissions:';
    if (!accountId || !namespaceId || !token) {
      return sendJSON(res, 500, { error: 'KV not configured' });
    }

    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys`);
    const limit = clampInt(req.query.limit || '20', 1, 50);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('prefix', prefix);
    const cursor = req.query.cursor || '';
    if (cursor) url.searchParams.set('cursor', cursor);

    const headers = { 'authorization': `Bearer ${token}` };
    const listResp = await fetch(url, { headers });
    const listJson = await listResp.json();
    if (!listResp.ok || !listJson.success) {
      return sendJSON(res, 502, { error: 'KV list failed', details: listJson });
    }
    const keys = (listJson.result || []).map(x => x.name);

    // Fetch values for each key (parallel)
    const values = await Promise.all(keys.map(async (name) => {
      try {
        const vurl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(name)}`;
        const vr = await fetch(vurl, { headers: { ...headers, 'content-type': 'application/json' } });
        if (!vr.ok) return null;
        const obj = await vr.json();
        if (!obj || typeof obj !== 'object') return null;
        // ensure id present
        obj.id = obj.id || (name.startsWith(prefix) ? name.slice(prefix.length) : name);
        return obj;
      } catch {
        return null;
      }
    }));

    const items = values.filter(Boolean).sort((a,b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    const nextCursor = (listJson.result_info && listJson.result_info.cursor) || null;
    const complete = !!(listJson.result_info && listJson.result_info.list_complete);
    return sendJSON(res, 200, { ok: true, items, nextCursor, complete });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal Error' });
  }
};

function sendCORS(res, status) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-token');
  res.status(status).end();
}
function sendJSON(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).end(JSON.stringify(data));
}
function clampInt(x, min, max) { const n = parseInt(x, 10); if (isNaN(n)) return min; return Math.max(min, Math.min(max, n)); }
function checkAdmin(req) { const t = (req.headers['x-admin-token'] || '').toString(); return !!process.env.ADMIN_TOKEN && t === process.env.ADMIN_TOKEN; }

