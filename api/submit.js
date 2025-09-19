// Vercel Serverless Function: POST /api/submit
// Validates payload + captcha, basic per-IP rate limit, and forwards to Slack if configured.

const MAX_PER_HOUR = parseInt(process.env.SUBMIT_RATE_LIMIT || '5', 10);
const ALLOW_ORIGINS = (process.env.SUBMIT_ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// naive in-memory rate limiter (best-effort within a single lambda instance)
globalThis.__RL = globalThis.__RL || new Map();

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
    if (!rateLimitOk(ip)) {
      return sendJSON(res, 429, { error: 'Too Many Requests' });
    }

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
    };

    // Store to Cloudflare KV if configured
    await storeToCloudflareKV(record).catch((err) => {
      console.error('KV store error', err);
    });

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

function rateLimitOk(ip) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const item = globalThis.__RL.get(ip) || { count: 0, resetAt: now + hour };
  if (now > item.resetAt) {
    item.count = 0;
    item.resetAt = now + hour;
  }
  if (item.count >= MAX_PER_HOUR) return false;
  item.count += 1;
  globalThis.__RL.set(ip, item);
  return true;
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

async function storeToCloudflareKV(record) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const token = process.env.CF_API_TOKEN;
  const prefix = process.env.CF_KV_PREFIX || 'submissions:';
  if (!accountId || !namespaceId || !token) return false;
  const key = encodeURIComponent(prefix + record.id);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(record),
  });
  if (!resp.ok) {
    throw new Error(`KV put failed: ${resp.status} ${await safeText(resp)}`);
  }
  return true;
}
