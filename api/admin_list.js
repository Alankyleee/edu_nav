// Vercel Serverless Function: GET /api/admin_list
// Lists submissions from Neon Postgres (paginated). Requires x-admin-token header.

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendCORS(res, 204);
    if (req.method !== 'GET') return sendJSON(res, 405, { error: 'Method Not Allowed' });

    if (!checkAdmin(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

    const limit = clampInt(req.query.limit || '20', 1, 50);
    const cursor = req.query.cursor || '';
    const q = (req.query.q || '').toString().trim();

    const sql = await getSql();
    await ensureTable(sql);

    let rows;
    if (q) {
      const like = `%${q}%`;
      if (cursor) {
        const [cts, cid] = String(cursor).split('|');
        rows = await sql`
          SELECT id, name, url, description, tags, disciplines, contact, page, ip, user_agent, ts, status, admin_note
          FROM submissions
          WHERE (name ILIKE ${like} OR url ILIKE ${like} OR description ILIKE ${like} OR contact ILIKE ${like}
                 OR tags::text ILIKE ${like} OR disciplines::text ILIKE ${like})
            AND (ts, id) < (${cts}::timestamptz, ${cid})
          ORDER BY ts DESC, id DESC
          LIMIT ${limit}
        `;
      } else {
        rows = await sql`
          SELECT id, name, url, description, tags, disciplines, contact, page, ip, user_agent, ts, status, admin_note
          FROM submissions
          WHERE (name ILIKE ${like} OR url ILIKE ${like} OR description ILIKE ${like} OR contact ILIKE ${like}
                 OR tags::text ILIKE ${like} OR disciplines::text ILIKE ${like})
          ORDER BY ts DESC, id DESC
          LIMIT ${limit}
        `;
      }
    } else {
      if (cursor) {
        const [cts, cid] = String(cursor).split('|');
        rows = await sql`
          SELECT id, name, url, description, tags, disciplines, contact, page, ip, user_agent, ts, status, admin_note
          FROM submissions
          WHERE (ts, id) < (${cts}::timestamptz, ${cid})
          ORDER BY ts DESC, id DESC
          LIMIT ${limit}
        `;
      } else {
        rows = await sql`
          SELECT id, name, url, description, tags, disciplines, contact, page, ip, user_agent, ts, status, admin_note
          FROM submissions
          ORDER BY ts DESC, id DESC
          LIMIT ${limit}
        `;
      }
    }

    const items = rows.map(r => ({
      ...r,
      tags: r.tags || [],
      disciplines: r.disciplines || [],
      adminNote: r.admin_note || '',
      userAgent: r.user_agent || '',
    }));
    const last = items[items.length - 1];
    const nextCursor = last ? `${last.ts}|${last.id}` : null;
    const complete = items.length < limit;
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
