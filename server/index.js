const path    = require('path');
const express = require('express');

const { migrate }     = require('./migrate');
const { buildRouter } = require('./crud');
const { pool, query } = require('./db');
const auth            = require('./auth');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────────────────────
// Auth endpoints (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────

// Tells the frontend whether a particular email exists and whether it has a
// password set yet. Used to show "set your password" vs "enter password".
app.post('/api/_user_status', async (req, res) => {
  try {
    const email = (req.body && req.body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    const u = await auth.findUserByEmail(email);
    if (!u) return res.json({ exists: false });
    res.json({ exists: true, name: u.name, hasPassword: !!u.password_hash });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Login (or first-time password setup).
app.post('/api/_login', async (req, res) => {
  try {
    const email    = (req.body && req.body.email || '').trim();
    const password = (req.body && req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const u = await auth.findUserByEmail(email);
    if (!u) return res.status(404).json({ error: 'No account for that email' });

    if (!u.password_hash) {
      // First-time setup: the supplied password becomes their password.
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      await auth.setUserPassword(u.id, password);
    } else {
      if (!auth.verifyPassword(password, u.password_salt, u.password_hash)) {
        return res.status(401).json({ error: 'Wrong password' });
      }
    }
    await auth.recordLogin(u.id);
    auth.setSessionCookie(res, u.email);
    res.json({ ok: true, user: { email: u.email, name: u.name } });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/_logout', (_req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Returns the current logged-in user, or { user: null } if not logged in.
app.get('/api/_me', async (req, res) => {
  const email = auth.getCurrentUserEmail(req);
  if (!email) return res.json({ user: null });
  const u = await auth.findUserByEmail(email);
  if (!u) { auth.clearSessionCookie(res); return res.json({ user: null }); }
  res.json({ user: { email: u.email, name: u.name } });
});

// ─────────────────────────────────────────────────────────────────────────
// Authenticated endpoints
// ─────────────────────────────────────────────────────────────────────────

// Everything under /api except the auth endpoints above requires login.
app.use('/api', (req, res, next) => {
  if (req.path === '/_login' || req.path === '/_logout' || req.path === '/_me' || req.path === '/_user_status') return next();
  if (auth.getCurrentUserEmail(req)) return next();
  res.status(401).json({ error: 'Auth required' });
});

// Read-only directory of users (no password fields).
app.get('/api/users', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, email, name FROM "users" ORDER BY name');
    res.json(rows);
  } catch (e) { next(e); }
});

// Generic CRUD for everything else.
app.use('/api', buildRouter());

// ─── Health check ────────────────────────────────────────────────────────
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── Static frontend + SPA fallback ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[seaport-crm] error:', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

(async () => {
  try {
    await migrate();
    app.listen(PORT, () => console.log(`[seaport-crm] listening on :${PORT}`));
  } catch (e) {
    console.error('[seaport-crm] startup failed:', e);
    process.exit(1);
  }
})();
