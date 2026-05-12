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

// Forgot-password — sends an email with a reset link. Always returns ok:true
// even if the email isn't registered (don't leak which addresses exist).
app.post('/api/_request_reset', async (req, res) => {
  try {
    const email = (req.body && req.body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    const u = await auth.findUserByEmail(email);
    if (u) {
      const token = await auth.createResetToken(u.id);
      const appUrl = process.env.APP_URL || '';
      const link  = `${appUrl}/#/reset?token=${encodeURIComponent(token)}`;
      const mailer = require('./mailer');
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222;">
          <div style="background:#14253f;color:#c4a861;padding:18px 22px;border-radius:10px;">
            <div style="font-size:12px;letter-spacing:.15em;color:#8a9ab2;">SEAPORT INLET MARINA</div>
            <div style="font-size:18px;font-weight:700;margin-top:4px;">Reset your password</div>
          </div>
          <p style="margin-top:18px;">Hi ${u.name || ''}, click the button below to set a new password. This link is good for 1 hour.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${link}" style="background:#14253f;color:#c4a861;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Set new password</a>
          </p>
          <p style="font-size:12px;color:#888;">If you didn't ask for this, you can ignore this email — your password is unchanged.</p>
        </div>`;
      await mailer.sendMail({ to: u.email, subject: 'Reset your Seaport CRM password', html });
    }
    res.json({ ok: true });
  } catch (e) { console.error('[reset request]', e); res.status(500).json({ error: e.message }); }
});

// Consume a reset token — sets the new password.
app.post('/api/_reset_password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    const r = await auth.consumeResetToken(token, password);
    if (!r.ok) {
      const msgs = { weak: 'Password must be at least 6 characters', expired: 'This reset link has expired', invalid: 'Invalid reset link', missing: 'Token and password required' };
      return res.status(400).json({ error: msgs[r.reason] || 'Reset failed' });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Change password while logged in.
app.post('/api/_change_password', async (req, res) => {
  const email = auth.getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Auth required' });
  try {
    const { current, password } = req.body || {};
    const r = await auth.changePassword(email, current, password);
    if (!r.ok) {
      const msgs = { weak: 'New password must be at least 6 characters', 'wrong-current': 'Current password is wrong', 'not-found': 'Account not found' };
      return res.status(400).json({ error: msgs[r.reason] || 'Change failed' });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Webhook for the daily follow-up email job. Hit by a GitHub Action every
// morning. Gated by CRON_SECRET (sent in the X-Cron-Secret header) — NOT by
// the user session, so the cron job doesn't need to be a logged-in user.
app.post('/api/_cron/run-followups', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers['x-cron-secret'];
  if (!expected || !supplied || expected !== supplied) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const { runFollowups } = require('./cron-followups');
    const summary = await runFollowups();
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron webhook] failed:', e);
    res.status(500).json({ error: e.message });
  }
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

// Everything under /api except the auth + cron endpoints requires login.
const PUBLIC_API_PATHS = new Set([
  '/_login', '/_logout', '/_me', '/_user_status',
  '/_request_reset', '/_reset_password', '/_change_password',
]);
app.use('/api', (req, res, next) => {
  if (PUBLIC_API_PATHS.has(req.path) || req.path.startsWith('/_cron/')) return next();
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
