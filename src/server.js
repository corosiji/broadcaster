const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword, verifyPassword, sanitizeText } = require('./lib/security');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.join(__dirname, '..', 'data', 'app-state.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
const RATE_MAX_LOGIN = Number(process.env.RATE_MAX_LOGIN || 10);
const STREAM_URL = process.env.STREAM_URL || 'http://127.0.0.1:8000/live';
const ICECAST_STATUS_URL = process.env.ICECAST_STATUS_URL || 'http://127.0.0.1:8000/status-json.xsl';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || ''; // format: salt:hash
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123'; // dev fallback

const sessions = new Map();
const rateBuckets = new Map();

const defaultState = {
  isLive: false,
  nowPlaying: 'Belum ada siaran aktif',
  programName: 'Morning Office Radio',
  listeners: 0,
  updatedAt: new Date().toISOString(),
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultState, null, 2));
}
const readState = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeState = (s) => {
  const payload = { ...s, updatedAt: new Date().toISOString() };
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  return payload;
};

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
    const [k, ...v] = part.trim().split('=');
    if (k) acc[k] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, filename, type) {
  const p = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(p)) return json(res, 404, { message: 'Not found' });
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(p).pipe(res);
}

function collectBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function createSession(username) {
  const sid = crypto.randomBytes(24).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { username, csrf, exp: Date.now() + SESSION_TTL_MS });
  return { sid, csrf };
}

function getSession(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session || session.exp < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return { sid, ...session };
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session || session.username !== ADMIN_USER) {
    json(res, 401, { message: 'Unauthorized' });
    return null;
  }
  const csrf = req.headers['x-csrf-token'];
  if (req.method !== 'GET' && csrf !== session.csrf) {
    json(res, 403, { message: 'Invalid CSRF token' });
    return null;
  }
  return session;
}

function rateLimit(req, key, max) {
  const ip = req.socket.remoteAddress || 'unknown';
  const bucketKey = `${ip}:${key}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);
  return bucket.count <= max;
}

function fetchIcecastStatus() {
  return new Promise((resolve) => {
    const lib = ICECAST_STATUS_URL.startsWith('https') ? https : http;
    const req = lib.get(ICECAST_STATUS_URL, { timeout: 3000 }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => data += chunk);
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const src = parsed.icestats?.source;
          const first = Array.isArray(src) ? src[0] : src;
          resolve({
            online: true,
            listeners: Number(first?.listeners || 0),
            title: first?.title || null,
            mount: first?.listenurl || null,
          });
        } catch {
          resolve({ online: false, listeners: 0 });
        }
      });
    });
    req.on('error', () => resolve({ online: false, listeners: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ online: false, listeners: 0 }); });
  });
}

ensureDataFile();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') return sendFile(res, 'index.html', 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/admin') return sendFile(res, 'admin.html', 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/app.js') return sendFile(res, 'app.js', 'application/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/styles.css') return sendFile(res, 'styles.css', 'text/css; charset=utf-8');

  if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { streamUrl: STREAM_URL });
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, readState());
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const icecast = await fetchIcecastStatus();
    return json(res, 200, { app: 'ok', icecast });
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/bootstrap') {
    const session = requireAuth(req, res);
    if (!session) return;
    return json(res, 200, { csrfToken: session.csrf, state: readState() });
  }

  if (req.method === 'POST' && url.pathname === '/api/listener/ping') {
    const state = readState();
    return json(res, 200, { ok: true, listeners: state.listeners });
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!rateLimit(req, 'login', RATE_MAX_LOGIN)) return json(res, 429, { message: 'Too many login attempts' });
    const body = await collectBody(req);
    const validUser = typeof body.username === 'string' && body.username === ADMIN_USER;
    const validPass = typeof body.password === 'string' && verifyPassword(body.password, ADMIN_PASS_HASH);
    if (!validUser || !validPass) return json(res, 401, { ok: false, message: 'Login gagal' });

    const { sid, csrf } = createSession(ADMIN_USER);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    });
    return res.end(JSON.stringify({ ok: true, csrfToken: csrf }));
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const session = getSession(req);
    if (session) sessions.delete(session.sid);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'sid=; HttpOnly; Max-Age=0; SameSite=Strict; Path=/'
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/state') {
    if (!requireAuth(req, res)) return;
    const body = await collectBody(req);
    const current = readState();

    const programName = sanitizeText(body.programName, current.programName);
    const nowPlaying = sanitizeText(body.nowPlaying, current.nowPlaying);
    const isLive = Boolean(body.isLive);

    const icecast = await fetchIcecastStatus();
    const updated = writeState({ ...current, programName, nowPlaying, isLive, listeners: icecast.listeners });
    return json(res, 200, { ...updated, icecast });
  }

  return json(res, 404, { message: 'Route tidak ditemukan' });
});

if (process.argv.includes('--gen-pass-hash')) {
  const idx = process.argv.indexOf('--gen-pass-hash');
  const password = process.argv[idx + 1];
  if (!password || password.startsWith('--')) {
    console.error('Usage: node src/server.js --gen-pass-hash "YourPassword"');
    process.exit(1);
  }
  console.log(hashPassword(password));
  process.exit(0);
}


setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions.entries()) {
    if (session.exp < now) sessions.delete(sid);
  }
}, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
