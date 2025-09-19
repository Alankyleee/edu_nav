// Vercel Serverless Function: POST /api/admin_update
// Updates submission status in Neon Postgres. Requires x-admin-token header.

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendCORS(res, 204);
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method Not Allowed' });
    if (!checkAdmin(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    let body = req.body;
    if (!body || typeof body !== 'object') {
      try { body = JSON.parse(req.body); } catch {}
    }
    if (!body || typeof body !== 'object') return sendJSON(res, 400, { error: 'Invalid JSON' });

    const { id, status, note = '' } = body;
    if (!id || typeof id !== 'string') return sendJSON(res, 400, { error: 'Missing id' });
    const allowed = new Set(['approved','rejected','pending']);
    if (!allowed.has(status)) return sendJSON(res, 400, { error: 'Invalid status' });

    const sql = await getSql();
    await ensureTable(sql);
    const r = await sql`
      UPDATE submissions
      SET status = ${status}, admin_note = ${note}, ts = ts
      WHERE id = ${id}
      RETURNING id
    `;
    if (!r || r.length === 0) return sendJSON(res, 404, { error: 'Not found' });
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

async function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  const { neon } = await import('@neondatabase/serverless');
  return neon(url);
}
async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      tags JSONB,
      disciplines JSONB,
      contact TEXT,
      page TEXT,
      ip TEXT,
      user_agent TEXT,
      ts TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS submissions_ts_idx ON submissions (ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions (status)`;
  await sql`CREATE INDEX IF NOT EXISTS submissions_ip_ts_idx ON submissions (ip, ts DESC)`;
}
