// Shared Gmail SMTP transport. Used by both the daily follow-up cron and
// password-reset emails. If GMAIL_USER / GMAIL_APP_PASSWORD aren't set we log
// a "would have sent" line and return ok:false (so the rest of the app keeps
// working in dev / before email is wired up).

const nodemailer = require('nodemailer');

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) return null;
  _transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return _transporter;
}

function getFromAddr() {
  const user = process.env.GMAIL_USER;
  return user ? `Seaport CRM <${user}>` : 'Seaport CRM';
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log('[mailer] GMAIL_* env vars not set — would have emailed', to, ':', subject);
    return { ok: false, reason: 'no-creds' };
  }
  try {
    const info = await t.sendMail({ from: getFromAddr(), to, subject, html, text });
    console.log(`[mailer] sent to ${to}: ${info.response}`);
    return { ok: true };
  } catch (e) {
    console.error(`[mailer] send failed to ${to}: ${e.message}`);
    return { ok: false, reason: 'send-failed', body: e.message };
  }
}

module.exports = { sendMail, getFromAddr };
