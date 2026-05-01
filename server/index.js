const path    = require('path');
const express = require('express');

const { migrate }     = require('./migrate');
const { buildRouter } = require('./crud');
const { pool }        = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// ── Optional shared-password gate ──────────────────────────────────────────
// If APP_PASSWORD is set, all /api/* routes require it. Frontend is always
// served — it shows a login screen when API calls return 401.
const PASSWORD = (process.env.APP_PASSWORD || '').trim();

function authed(req) {
  if (!PASSWORD) return true;
  const cookie = (req.headers.cookie || '')
    .split(';').map((s) => s.trim()).find((s) => s.startsWith('seaport_auth='));
  return Boolean(cookie && cookie.split('=')[1] === encodeURIComponent(PASSWORD));
}

app.post('/api/_login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true, noAuth: true });
  const supplied = (req.body && req.body.password) || '';
  if (supplied !== PASSWORD) return res.status(401).json({ error: 'Bad password' });
  res.setHeader(
    'Set-Cookie',
    `seaport_auth=${encodeURIComponent(PASSWORD)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  res.json({ ok: true });
});

app.get('/api/_authcheck', (req, res) => {
  res.json({ authRequired: Boolean(PASSWORD), authed: authed(req) });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/_login' || req.path === '/_authcheck') return next();
  if (!authed(req)) return res.status(401).json({ error: 'Auth required' });
  next();
});

// API
app.use('/api', buildRouter());

// Health check for Render
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback — any non-API path serves index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler — never let an unhandled error crash the response
app.use((err, _req, res, _next) => {
  console.error('[seaport-crm] error:', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

(async () => {
  try {
    await migrate();
    app.listen(PORT, () => {
      console.log(`[seaport-crm] listening on :${PORT}`);
    });
  } catch (e) {
    console.error('[seaport-crm] startup failed:', e);
    process.exit(1);
  }
})();
