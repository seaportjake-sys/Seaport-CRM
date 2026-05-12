// Daily follow-up email job.
//
// Two ways this can run:
//   1. Inside the web service via POST /api/_cron/run-followups
//      (gated by CRON_SECRET — that's how the daily GitHub Action triggers it).
//   2. Standalone CLI: `node server/cron-followups.js`
//      (handy for ad-hoc runs / local testing).
//
// Either way it:
//   1. Finds all leads whose follow_up_date is on or before today.
//   2. Groups them by salesperson (matched against the seeded user names).
//   3. Sends each salesperson a single email of their day's follow-ups via Resend.
//
// Required env vars on the web service:
//   DATABASE_URL          — wired automatically from the Postgres database
//   GMAIL_USER            — Gmail address that sends the daily emails
//                           (e.g. seaportjake@gmail.com or seaportcrm@gmail.com)
//   GMAIL_APP_PASSWORD    — 16-char Google App Password for that account
//                           (https://myaccount.google.com/apppasswords)
//   APP_URL               — public URL of your CRM, used in email links

const { query }  = require('./db');
const mailer     = require('./mailer');

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function renderEmail({ user, leads, appUrl }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const rows = leads.map((l) => {
    const due  = fmt(l.follow_up_date);
    const last = l.last_contact_date ? `Last: ${fmt(l.last_contact_date)}` : 'Never contacted';
    return `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #eee;">
          <div style="font-weight:600;color:#14253f;font-size:15px;">${escapeHtml(l.name || '—')}</div>
          <div style="color:#444;font-size:13px;margin-top:2px;">${escapeHtml(l.boat_interest || '')}</div>
          <div style="color:#888;font-size:12px;margin-top:4px;">${escapeHtml(last)} · Status: ${escapeHtml(l.status || 'Warm')}${l.phone ? ' · ' + escapeHtml(l.phone) : ''}</div>
          ${l.notes ? `<div style="color:#555;font-size:12px;margin-top:6px;font-style:italic;">${escapeHtml(String(l.notes).slice(0, 200))}</div>` : ''}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #eee;text-align:right;font-size:13px;color:#c4a861;font-weight:600;white-space:nowrap;">${escapeHtml(due)}</td>
      </tr>`;
  }).join('');

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222;">
    <div style="background:#14253f;color:#c4a861;padding:18px 22px;border-radius:10px 10px 0 0;">
      <div style="font-size:12px;letter-spacing:.15em;color:#8a9ab2;">SEAPORT INLET MARINA</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">Good morning, ${escapeHtml(user.name)}</div>
      <div style="font-size:13px;color:#cfd6e3;margin-top:4px;">${today} · ${leads.length} follow-up${leads.length === 1 ? '' : 's'} due</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:0 0 10px 10px;overflow:hidden;">
      ${rows}
    </table>
    ${appUrl ? `<div style="text-align:center;margin-top:18px;">
      <a href="${appUrl}" style="background:#14253f;color:#c4a861;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block;">Open CRM</a>
    </div>` : ''}
    <div style="text-align:center;color:#aaa;font-size:11px;margin-top:18px;">Daily 7am follow-up summary · Seaport Inlet Marina CRM</div>
  </div>`;
}

// Runs the full pipeline. Returns a summary {sent, skipped, unassigned}.
async function runFollowups() {
  const APP_URL     = process.env.APP_URL     || '';

  const today = todayISO();
  const { rows: leads } = await query(
    `SELECT * FROM "leads" WHERE follow_up_date <= $1 ORDER BY follow_up_date ASC`,
    [today]
  );
  if (!leads.length) {
    console.log('[cron] no follow-ups due today');
    return { sent: 0, skipped: 0, unassigned: 0, total: 0 };
  }

  const { rows: users } = await query('SELECT email, name FROM "users"');
  const userByName = Object.fromEntries(users.map((u) => [u.name.toLowerCase(), u]));

  const groups = {};
  let unassigned = 0;
  for (const lead of leads) {
    const u = userByName[(lead.salesperson || '').toLowerCase()];
    if (u) (groups[u.email] = groups[u.email] || { user: u, leads: [] }).leads.push(lead);
    else   unassigned++;
  }

  let sent = 0, skipped = 0;
  for (const { user, leads: dueLeads } of Object.values(groups)) {
    const html    = renderEmail({ user, leads: dueLeads, appUrl: APP_URL });
    const subject = `${dueLeads.length} follow-up${dueLeads.length === 1 ? '' : 's'} for today`;
    const r       = await mailer.sendMail({ to: user.email, subject, html });
    if (r.ok) sent++; else skipped++;
  }
  return { sent, skipped, unassigned, total: leads.length };
}

// CLI entry point: `node server/cron-followups.js`
if (require.main === module) {
  const { pool } = require('./db');
  runFollowups()
    .then(async (r) => { console.log('[cron] done:', r); await pool.end(); })
    .catch(async (err) => { console.error('[cron] FAILED:', err); try { await pool.end(); } catch {} process.exit(1); });
}

module.exports = { runFollowups };
