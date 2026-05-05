// Daily follow-up email job.
//
// Runs from a Render Cron Job (see render.yaml). Each morning it:
//   1. Finds all leads whose follow_up_date is on or before today.
//   2. Groups them by salesperson (matched against the seeded user names).
//   3. Sends each salesperson a single email of their day's follow-ups via Resend.
//
// Required env vars on the cron service:
//   DATABASE_URL       — wired automatically from the Postgres database
//   RESEND_API_KEY     — get one free at resend.com (100 emails/day on free tier)
//   RESEND_FROM        — verified sender (e.g. "Seaport CRM <crm@yourdomain.com>")
//                        For testing, "Seaport CRM <onboarding@resend.dev>" works
//                        but only sends to the email registered with Resend.
//   APP_URL            — public URL of your CRM, used in email links
//                        (e.g. https://seaport-crm-5qti.onrender.com)

const { pool, query } = require('./db');
const { SEED_USERS }  = require('./migrate');

const RESEND_KEY  = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Seaport CRM <onboarding@resend.dev>';
const APP_URL     = process.env.APP_URL     || '';

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

async function getDueFollowUps() {
  const today = todayISO();
  const { rows } = await query(
    `SELECT * FROM "leads" WHERE follow_up_date <= $1 ORDER BY follow_up_date ASC`,
    [today]
  );
  return rows;
}

async function getUsers() {
  const { rows } = await query('SELECT email, name FROM "users"');
  return rows;
}

function groupByUser(leads, users) {
  const userByName = Object.fromEntries(users.map((u) => [u.name.toLowerCase(), u]));
  const groups = {};
  const unassigned = [];
  for (const lead of leads) {
    const u = userByName[(lead.salesperson || '').toLowerCase()];
    if (u) (groups[u.email] = groups[u.email] || { user: u, leads: [] }).leads.push(lead);
    else   unassigned.push(lead);
  }
  return { groups, unassigned };
}

function renderEmail({ user, leads }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const rows = leads.map((l) => {
    const url   = APP_URL ? `${APP_URL}/#/leads` : '#';
    const due   = fmt(l.follow_up_date);
    const last  = l.last_contact_date ? `Last: ${fmt(l.last_contact_date)}` : 'Never contacted';
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
    ${APP_URL ? `<div style="text-align:center;margin-top:18px;">
      <a href="${APP_URL}" style="background:#14253f;color:#c4a861;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block;">Open CRM</a>
    </div>` : ''}
    <div style="text-align:center;color:#aaa;font-size:11px;margin-top:18px;">Daily 7am follow-up summary · Seaport Inlet Marina CRM</div>
  </div>`;
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.log('[cron] RESEND_API_KEY not set — would have emailed', to, ':', subject);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  const text = await res.text();
  if (!res.ok) console.error(`[cron] Resend ${res.status} for ${to}: ${text}`);
  else         console.log(`[cron] sent to ${to} (${res.status})`);
}

async function main() {
  console.log('[cron] starting follow-up run');
  const leads = await getDueFollowUps();
  if (!leads.length) {
    console.log('[cron] no follow-ups due today');
    await pool.end();
    return;
  }
  const users = await getUsers();
  const { groups, unassigned } = groupByUser(leads, users);

  for (const { user, leads: dueLeads } of Object.values(groups)) {
    await sendEmail(user.email, `${dueLeads.length} follow-up${dueLeads.length === 1 ? '' : 's'} for today`, renderEmail({ user, leads: dueLeads }));
  }
  if (unassigned.length) {
    console.log(`[cron] ${unassigned.length} leads have a salesperson with no matching user — skipped`);
  }
  await pool.end();
  console.log('[cron] done');
}

main().catch((err) => { console.error('[cron] FAILED:', err); process.exit(1); });
