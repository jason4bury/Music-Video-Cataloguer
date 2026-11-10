const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { db, THUMB_DIR } = require('./db');
const { scanLibrary, getScanState, LIBRARY_PATH } = require('./scanner');
const { ensureAccount, login, SettingsError } = require('./auth');
const SqliteSessionStore = require('./sqliteSessionStore');
const { pkg, DISPLAY_VERSION } = require('./version');

const PORT = Number(process.env.PORT) || 3211;
const SCAN_ON_START = process.env.SCAN_ON_START !== 'false';
const SCAN_INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MINUTES || '0', 10) || 0;
const SESSION_COOKIE = 'mvc.sid';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

try {
  ensureAccount();
} catch (err) {
  if (!(err instanceof SettingsError)) throw err;
  console.error(`Music Video Cataloguer can't start: ${err.message}`);
  process.exit(1);
}

// Session cookies are signed with SESSION_SECRET if it's set. Otherwise a random secret is
// generated once and kept in the database, so sessions still survive a restart without any
// setting to fill in.
function sessionSecret() {
  const fromEnv = (process.env.SESSION_SECRET || '').trim();
  if (fromEnv) {
    if (fromEnv.length < 32) {
      console.error("Music Video Cataloguer can't start: SESSION_SECRET must be at least 32 characters (or blank).");
      process.exit(1);
    }
    return fromEnv;
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'session_secret'").get();
  if (row) return row.value;
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('session_secret', ?)").run(secret);
  return secret;
}

const app = express();
app.disable('x-powered-by');
// Only trust X-Forwarded-For from a reverse proxy when told there is one. Trusting it otherwise
// would let anyone dodge the sign-in lockout by sending a different made-up address each time.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(
  session({
    name: SESSION_COOKIE,
    secret: sessionSecret(),
    store: new SqliteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Marked secure automatically when the request came in over HTTPS (directly, or through a
      // reverse proxy with TRUST_PROXY=true).
      secure: 'auto',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// Health check for Docker, Portainer and uptime monitors. Open without signing in, so it says
// nothing about the library beyond whether the database answers.
function health(_req, res) {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, version: DISPLAY_VERSION });
  } catch {
    res.status(503).json({ ok: false });
  }
}
app.get('/healthz', health);
app.get('/health', health);

// Everything the sign-in page needs is reachable without a session.
const OPEN_PATHS = new Set(['/login', '/api/login', '/favicon.ico', '/apple-touch-icon.png', '/icon-64.png']);

app.use((req, res, next) => {
  if (OPEN_PATHS.has(req.path)) return next();
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login');
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.post('/api/login', login);

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });
});

app.get('/api/about', (_req, res) => {
  res.json({
    name: pkg.displayName,
    version: DISPLAY_VERSION,
    copyright: pkg.copyright,
    licence: pkg.license,
    homepage: pkg.homepage,
  });
});

app.use('/thumbnails', express.static(THUMB_DIR, { maxAge: '1d' }));
app.use('/api', require('./routes/videos'));
app.use('/api', require('./routes/playlists'));
app.use(express.static(PUBLIC_DIR));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// Errors come back as a short JSON message rather than an HTML page with a stack trace.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
});

app.listen(PORT, () => {
  console.log(`Music Video Cataloguer v${DISPLAY_VERSION} listening on :${PORT}`);
  console.log(`Library: ${LIBRARY_PATH}`);

  const logScan = (s) => {
    const warn = s.warning ? ` (${s.warning})` : '';
    console.log(`Scan finished: +${s.added} -${s.removed} (${s.total} files seen)${warn}`);
  };
  if (SCAN_ON_START) scanLibrary().then(logScan);
  if (SCAN_INTERVAL_MIN > 0) {
    setInterval(() => {
      if (!getScanState().running) scanLibrary().then(logScan);
    }, SCAN_INTERVAL_MIN * 60 * 1000);
  }
});
