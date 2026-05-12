// Lightweight auth for a small team.
//   • Passwords hashed with Node's built-in crypto.scrypt (no native deps).
//   • Sessions are HMAC-signed cookies (HttpOnly, SameSite=Lax) — stateless,
//     so they survive deploys without a session store.
//   • Three users are seeded on boot in migrate.js. Each picks their own
//     password the first time they log in.

const crypto = require('crypto');
const { query } = require('./db');

// SESSION_SECRET should be set in Render (render.yaml uses generateValue:true).
// In dev/missing, we fall back to a per-process secret so things still work,
// at the cost of cookies being invalidated on every restart.
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET not set — using per-process secret. Cookies will not survive restarts.');
}

const COOKIE_NAME = 'seaport_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// ─── Password hashing ─────────────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  // timingSafeEqual requires equal-length buffers.
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Cookie signing (stateless sessions) ──────────────────────────────────
function sign(value) {
  const sig = crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32);
  return `${value}.${sig}`;
}
function verify(signed) {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32);
  try {
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  return value;
}

function getCurrentUserEmail(req) {
  const cookies = (req.headers.cookie || '').split(';').map((s) => s.trim());
  const match   = cookies.find((c) => c.startsWith(COOKIE_NAME + '='));
  if (!match) return null;
  const signed = decodeURIComponent(match.split('=').slice(1).join('='));
  return verify(signed);
}

function setSessionCookie(res, email) {
  const value = encodeURIComponent(sign(email));
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
  );
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ─── User lookup ──────────────────────────────────────────────────────────
async function findUserByEmail(email) {
  if (!email) return null;
  const { rows } = await query(
    'SELECT id, email, name, password_hash, password_salt, last_login_at FROM "users" WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  return rows[0] || null;
}
async function setUserPassword(id, password) {
  const { salt, hash } = hashPassword(password);
  await query(
    'UPDATE "users" SET password_hash = $1, password_salt = $2 WHERE id = $3',
    [hash, salt, id]
  );
}
async function recordLogin(id) {
  await query('UPDATE "users" SET last_login_at = CURRENT_DATE WHERE id = $1', [id]);
}

// ─── Password reset tokens ────────────────────────────────────────────────
// Random opaque tokens with a server-side expiry. One-shot — consuming the
// token clears it and rotates the password. Tokens last 1 hour.
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

async function createResetToken(userId) {
  const token   = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await query(
    'UPDATE "users" SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
    [token, expires, userId]
  );
  return token;
}

async function consumeResetToken(token, newPassword) {
  if (!token || !newPassword) return { ok: false, reason: 'missing' };
  if (newPassword.length < 6)  return { ok: false, reason: 'weak' };
  const { rows } = await query(
    `SELECT id, password_reset_expires FROM "users"
      WHERE password_reset_token = $1 LIMIT 1`,
    [token]
  );
  const u = rows[0];
  if (!u) return { ok: false, reason: 'invalid' };
  if (!u.password_reset_expires || new Date(u.password_reset_expires) < new Date()) {
    return { ok: false, reason: 'expired' };
  }
  await setUserPassword(u.id, newPassword);
  await query(
    'UPDATE "users" SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = $1',
    [u.id]
  );
  return { ok: true, userId: u.id };
}

// Change password while logged in (requires the current password).
async function changePassword(email, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) return { ok: false, reason: 'weak' };
  const u = await findUserByEmail(email);
  if (!u || !u.password_hash) return { ok: false, reason: 'not-found' };
  if (!verifyPassword(currentPassword, u.password_salt, u.password_hash)) {
    return { ok: false, reason: 'wrong-current' };
  }
  await setUserPassword(u.id, newPassword);
  return { ok: true };
}

// ─── Express middleware ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const email = getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Auth required' });
  req.userEmail = email;
  next();
}

module.exports = {
  hashPassword, verifyPassword,
  setSessionCookie, clearSessionCookie, getCurrentUserEmail,
  findUserByEmail, setUserPassword, recordLogin,
  createResetToken, consumeResetToken, changePassword,
  requireAuth,
};
