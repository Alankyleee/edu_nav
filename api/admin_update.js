// Vercel Serverless Function: POST /api/admin_update
// Updates submission status in Cloudflare KV. Requires x-admin-token header.

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendCORS(res, 204);
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method Not Allowed' });
    if (!checkAdmin(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    const accountId = process.env.CF_ACCOUNT_ID;
    const namespaceId = process.env.CF_KV_NAMESPACE_ID;
    const token = process.env.CF_API_TOKEN;
    const prefix = process.env.CF_KV_PREFIX || 'submissions:';
    if (!accountId || !namespaceId || !token) {
      return sendJSON(res, 500, { error: 'KV not configured' });
    }

    let body = req.body;
    if (!body || typeof body !== 'object') {
      try { body = JSON.parse(req.body); } catch {}
    }
    if (!body || typeof body !== 'object') return sendJSON(res, 400, { error: 'Invalid JSON' });

    const { id, status, note = '' } = body;
    if (!id || typeof id !== 'string') return sendJSON(res, 400, { error: 'Missing id' });
    const allowed = new Set(['approved','rejected','pending']);
    if (!allowed.has(status)) return sendJSON(res, 400, { error: 'Invalid status' });

    // Read existing
    const key = encodeURIComponent(prefix + id);
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
    const headers = { 'authorization': `Bearer ${token}` };
    const gr = await fetch(`${base}/values/${key}`, { headers });
    if (gr.status === 404) return sendJSON(res, 404, { error: 'Not found' });
    if (!gr.ok) return sendJSON(res, 502, { error: 'KV get failed' });
    let rec = await gr.json();
    if (!rec || typeof rec !== 'object') return sendJSON(res, 500, { error: 'Corrupted record' });

    rec.status = status;
    rec.adminAt = new Date().toISOString();
    rec.adminNote = String(note || '');

    const pr = await fetch(`${base}/values/${key}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(rec),
    });
    if (!pr.ok) return sendJSON(res, 502, { error: 'KV put failed' });

    return sendJSON(res, 200, { ok: true, id, status });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal Error' });
  }
};

function sendCORS(res, status) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-admin-token');
  res.status(status).end();
}
function sendJSON(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).end(JSON.stringify(data));
}
function checkAdmin(req) { const t = (req.headers['x-admin-token'] || '').toString(); return !!process.env.ADMIN_TOKEN && t === process.env.ADMIN_TOKEN; }

