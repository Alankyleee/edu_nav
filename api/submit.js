// Vercel Serverless Function: POST /api/submit
// Validates payload + captcha, DB rate limit, inserts into Neon Postgres, forwards to Slack (optional).

const MAX_PER_HOUR = parseInt(process.env.SUBMIT_RATE_LIMIT || '5', 10);
const ALLOW_ORIGINS = (process.env.SUBMIT_ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      return sendCORS(res, 204);
    }
    if (req.method !== 'POST') {
      return sendJSON(res, 405, { error: 'Method Not Allowed' });
    }

    // CORS: allow same-origin; optional allowlist via env
    const origin = req.headers.origin || '';
    if (ALLOW_ORIGINS.length > 0) {
      if (!ALLOW_ORIGINS.includes(origin)) {
        return sendJSON(res, 403, { error: 'Forbidden origin' });
      }
    }

    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

    let body = req.body;
    if (!body || typeof body !== 'object') {
      try { body = JSON.parse(req.body); } catch {}
    }
    if (!body || typeof body !== 'object') {
      return sendJSON(res, 400, { error: 'Invalid JSON' });
    }

    const { name, url, description = '', tags = [], disciplines = [], contact = '', page = '', captcha = {} } = body;

    // Validate fields
    if (!isNonEmptyString(name, 2, 120)) return sendJSON(res, 400, { error: 'Invalid name' });
    if (!isValidUrl(url)) return sendJSON(res, 400, { error: 'Invalid url' });
    if (!isString(description, 0, 2000)) return sendJSON(res, 400, { error: 'Invalid description' });
    if (!isString(contact, 0, 200)) return sendJSON(res, 400, { error: 'Invalid contact' });
    if (!Array.isArray(tags) || tags.length > 20 || !tags.every(t => isNonEmptyString(t, 1, 40))) return sendJSON(res, 400, { error: 'Invalid tags' });
    if (!Array.isArray(disciplines) || disciplines.length > 20 || !disciplines.every(d => isNonEmptyString(d, 2, 20))) return sendJSON(res, 400, { error: 'Invalid disciplines' });

    // Captcha check: expects {a,b,op:'+', answer}
    const { a, b, op = '+', answer } = captcha || {};
    const expected = Number(a) + Number(b);
    if (!(op === '+' && Number(answer) === expected)) {
      return sendJSON(res, 400, { error: 'Captcha failed' });
    }

    const record = {
      id: randomId(),
      ip,
      name: String(name),
      url: String(url),
      description: String(description || ''),
      tags,
      disciplines,
      contact: String(contact || ''),
      page: String(page || ''),
      userAgent: req.headers['user-agent'] || '',
      ts: new Date().toISOString(),
      status: 'pending',
    };

    // Insert into Neon Postgres (and enforce DB-based rate limit)
    const sql = await getSql();
    await ensureTable(sql);
    // DB rate limit: count submissions from this IP in last hour
    try {
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM submissions WHERE ip = ${ip} AND ts > now() - interval '1 hour'`;
      if (count >= MAX_PER_HOUR) {
        return sendJSON(res, 429, { error: 'Too Many Requests' });
      }
    } catch (err) {
      console.error('Rate limit query failed', err);
      // continue without failing hard
    }
    try {
      await sql`
        INSERT INTO submissions (id, name, url, description, tags, disciplines, contact, page, ip, user_agent, ts, status)
        VALUES (
          ${record.id}, ${record.name}, ${record.url}, ${record.description}, ${sql.json(record.tags)}, ${sql.json(record.disciplines)},
          ${record.contact}, ${record.page}, ${record.ip}, ${record.userAgent}, ${record.ts}, ${record.status}
        )
      `;
    } catch (err) {
      console.error('DB insert failed', err);
      return sendJSON(res, 500, { error: 'DB insert failed' });
    }

    // Forward to Slack, if configured
    const webhook = process.env.SLACK_WEBHOOK_URL || '';
    if (webhook) {
      try {
        const text = `新网站提交\n• 名称: ${record.name}\n• 链接: ${record.url}\n• 简介: ${truncate(record.description, 400)}\n• 标签: ${record.tags.join(', ')}\n• 学科: ${record.disciplines.join(', ')}\n• 联系: ${record.contact || '-'}\n• 来源页: ${record.page || '-'}\n• IP: ${record.ip}`;
        const payload = { text }; // simple text; Slack Incoming Webhook supports this
        const resp = await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          console.error('Slack webhook failed', await safeText(resp));
        }
      } catch (err) {
        console.error('Slack webhook error', err);
      }
    } else {
      console.log('Submission record (no webhook configured):', record);
    }

    return sendJSON(res, 200, { ok: true, id: record.id });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal Error' });
  }
};

function sendCORS(res, status) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.status(status).end();
}

function sendJSON(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).end(JSON.stringify(data));
}

function isNonEmptyString(s, min, max) {
  return typeof s === 'string' && s.trim().length >= min && s.trim().length <= max;
}
function isString(s, min, max) {
  return typeof s === 'string' && s.length >= min && s.length <= max;
}
function isValidUrl(u) {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; }
}
function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
async function safeText(r) { try { return await r.text(); } catch { return ''; } }
function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

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
