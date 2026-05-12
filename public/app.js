// Seaport Inlet Marina — Sales Platform frontend.
// Mobile-first. Vanilla JS. No build step.
//
// Data model is in server/entities.js. The frontend has hand-built views per
// tab so the brand layout/feel matches the previous design rather than being
// auto-generated.

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  currentUser: null,        // { email, name } once logged in
  users:       [],          // [{ email, name }] — directory of all salespeople

  leads:  [],
  boats:  [],
  deals:  [],

  currentTab:  'leads',
  leadFilter:  'All',     // All / Hot / Warm / Cold / Need Contact
  boatFilter:  'All',     // All / In Stock / Sold / On Order
  dealFilter:  'All',     // All / Active / Sold / Lost
  leadSearch:  '',
  boatSearch:  '',
  dealSearch:  '',
};

// ── API helper ─────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Auth required');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || res.statusText || 'Request failed');
  return data;
}

// ── Auth (per-user email + password) ───────────────────────────────────
async function checkAuth() {
  try {
    const { user } = await fetch('/api/_me').then((x) => x.json());
    if (!user) { showLogin(); return false; }
    state.currentUser = user;
    hideLogin();
    return true;
  } catch (e) {
    toast('Could not reach the server', 'error');
    return false;
  }
}
function showLoginStep(step) {
  $('#login-overlay').hidden = false;
  ['#login-email-form','#login-password-form','#login-forgot-form','#login-reset-form']
    .forEach((s) => { const el = $(s); if (el) el.hidden = true; });
  $('#login-error').hidden = true;
  $('#login-success').hidden = true;
  if (step === 'email') {
    $('#login-email-form').hidden = false;
    $('#login-subtitle').textContent = 'Sign in with your work email.';
    setTimeout(() => $('#login-email').focus(), 50);
  } else if (step === 'password') {
    $('#login-password-form').hidden = false;
    setTimeout(() => $('#login-password').focus(), 50);
  } else if (step === 'forgot') {
    $('#login-forgot-form').hidden = false;
    $('#login-subtitle').textContent = 'Reset your password';
    setTimeout(() => $('#login-forgot-email').focus(), 50);
  } else if (step === 'reset') {
    $('#login-reset-form').hidden = false;
    $('#login-subtitle').textContent = 'Set a new password';
    setTimeout(() => $('#login-reset-password').focus(), 50);
  }
}
function showLogin() { showLoginStep('email'); }
function hideLogin() { $('#login-overlay').hidden = true; }

let pendingEmail = '';
let pendingNeedsSetup = false;
let pendingResetToken = '';

$('#login-email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  const email = $('#login-email').value.trim();
  if (!email) return;
  try {
    const r = await fetch('/api/_user_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then((x) => x.json());
    if (!r.exists) {
      $('#login-error').textContent = `No account for "${email}". Ask Jake to add you.`;
      $('#login-error').hidden = false;
      return;
    }
    pendingEmail        = email;
    pendingNeedsSetup   = !r.hasPassword;
    $('#login-password').value = '';
    $('#login-password-confirm').value = '';
    $('#login-password-confirm').hidden = !pendingNeedsSetup;
    $('#login-submit').textContent = pendingNeedsSetup ? 'Set password & log in' : 'Log in';
    $('#login-forgot-link').hidden = pendingNeedsSetup;
    showLoginStep('password');
    $('#login-subtitle').textContent =
      pendingNeedsSetup
        ? `First time, ${r.name}? Pick a password (at least 6 characters).`
        : `Welcome back, ${r.name}.`;
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});

$('#login-back').addEventListener('click', () => {
  pendingEmail = '';
  pendingNeedsSetup = false;
  showLoginStep('email');
});

// Forgot password flow
$('#login-forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  $('#login-forgot-email').value = pendingEmail || $('#login-email').value || '';
  showLoginStep('forgot');
});
$('#login-forgot-back').addEventListener('click', () => showLoginStep('email'));
$('#login-forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  $('#login-success').hidden = true;
  const email = $('#login-forgot-email').value.trim();
  if (!email) return;
  try {
    await fetch('/api/_request_reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    $('#login-success').textContent = `If ${email} is registered, a reset email is on its way. Check your inbox.`;
    $('#login-success').hidden = false;
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});

// Reset password (landing from email link)
$('#login-reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  const password = $('#login-reset-password').value;
  const confirm  = $('#login-reset-confirm').value;
  if (password !== confirm) {
    $('#login-error').textContent = "Passwords don't match";
    $('#login-error').hidden = false;
    return;
  }
  try {
    const r = await fetch('/api/_reset_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pendingResetToken, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      $('#login-error').textContent = data.error || 'Reset failed';
      $('#login-error').hidden = false;
      return;
    }
    pendingResetToken = '';
    history.replaceState(null, '', '#/leads');
    $('#login-success').textContent = 'Password updated. Sign in below.';
    showLoginStep('email');
    $('#login-success').hidden = false;
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});

$('#login-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  const password = $('#login-password').value;
  if (pendingNeedsSetup) {
    if (password.length < 6) {
      $('#login-error').textContent = 'Password must be at least 6 characters';
      $('#login-error').hidden = false;
      return;
    }
    if (password !== $('#login-password-confirm').value) {
      $('#login-error').textContent = "Passwords don't match";
      $('#login-error').hidden = false;
      return;
    }
  }
  try {
    const r = await fetch('/api/_login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      $('#login-error').textContent = data.error || 'Login failed';
      $('#login-error').hidden = false;
      return;
    }
    state.currentUser = data.user;
    hideLogin();
    boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});

async function logout() {
  if (!confirm('Sign out?')) return;
  try { await api('POST', '/_logout'); } catch {}
  state.currentUser = null;
  location.reload();
}

// ── Toast ──────────────────────────────────────────────────────────────
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'error' ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2400);
}

// ── Modal sheet ────────────────────────────────────────────────────────
function showSheet(html) {
  const sheet = $('#modal-sheet');
  sheet.innerHTML = `<div class="sheet-handle"></div>` + html;
  $('#modal-overlay').hidden = false;
}
function closeSheet() { $('#modal-overlay').hidden = true; $('#modal-sheet').innerHTML = ''; }
$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeSheet();
});

// ── Utilities ──────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#39;');
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function parseDate(d) {
  if (!d) return null;
  // Postgres DATE → "YYYY-MM-DD" or full ISO timestamp depending on driver
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(Date.UTC(y, m - 1, day));
}
function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function daysSince(d) {
  const dt = parseDate(d); if (!dt) return null;
  return daysBetween(dt, parseDate(todayISO()));
}
function shortDate(d) {
  const dt = parseDate(d); if (!dt) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  if (Math.abs(v) >= 1000) return '$' + Math.round(v).toLocaleString();
  return '$' + (Math.round(v * 100) / 100).toLocaleString();
}
function moneyShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return '$' + (Math.round(v / 100) / 10).toLocaleString() + 'k';
  return '$' + Math.round(v).toLocaleString();
}
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
}
function needsContact(lead) {
  // "Needs contact" if a follow-up date is set and is on or before today.
  const f = parseDate(lead.follow_up_date);
  if (!f) return false;
  return f.getTime() <= parseDate(todayISO()).getTime();
}

// ── Boot ───────────────────────────────────────────────────────────────
async function boot() {
  // If the URL is a password-reset link from email, intercept BEFORE auth.
  const hash = location.hash || '';
  const m = hash.match(/^#\/reset\?token=([^&]+)/);
  if (m) {
    pendingResetToken = decodeURIComponent(m[1]);
    showLoginStep('reset');
    return;
  }

  if (!await checkAuth()) return;

  // Try to swap in a real logo if one was uploaded to /logo.png.
  fetch('/logo.png', { method: 'HEAD' }).then((r) => {
    if (r.ok) {
      const img = '<img src="/logo.png" alt="Seaport Inlet Marina" />';
      ['#brand-logo', '#brand-logo-side', '#brand-logo-login'].forEach((sel) => {
        const el = $(sel); if (el) el.innerHTML = img;
      });
    }
  }).catch(() => {});

  // Render current user in the topbar (mobile) — sidebar (desktop) has logout already.
  if (state.currentUser) {
    const chip = $('#topbar-user');
    chip.hidden = false;
    $('#topbar-user-initials').textContent = initials(state.currentUser.name);
    chip.onclick = logout;
  }

  await reloadAll();
  switchTab(location.hash.replace(/^#\//, '') || 'leads');
}

async function reloadAll() {
  const [users, leads, boats, deals] = await Promise.all([
    api('GET', '/users').catch(() => []),
    api('GET', '/leads').catch(() => []),
    api('GET', '/boats').catch(() => []),
    api('GET', '/deals').catch(() => []),
  ]);
  state.users = users;
  state.leads = leads;
  state.boats = boats;
  state.deals = deals;
  updateLeadsBadge();
  renderCurrentTab();
}

// Build <option> list of salespeople from the loaded users directory.
// Falls back gracefully if /api/users hasn't loaded yet.
function salespersonOptions(selected) {
  const names = state.users.length ? state.users.map((u) => u.name) : ['Jake', 'Theo', 'Robert'];
  const opts  = names.concat(names.includes('Other') ? [] : ['Other']);
  return opts.map((s) => `<option ${String(selected) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

// ── Nav (bottom on mobile, sidebar on desktop) ─────────────────────────
$$('#bottombar .nav-item, #sidebar .nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

const TAB_TITLES = { leads: 'Leads', boats: 'Boats', deals: 'Deals', tools: 'Tools' };

function switchTab(name) {
  if (!TAB_TITLES[name]) name = 'leads';
  state.currentTab = name;
  history.replaceState(null, '', '#/' + name);

  $$('.tab-page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
  $$('#bottombar .nav-item, #sidebar .nav-item').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name));
  $('#topbar').setAttribute('data-page-title', TAB_TITLES[name]);

  // Topbar action button changes per tab.
  const action = $('#topbar-action');
  if      (name === 'leads') { action.hidden = false; action.textContent = '+ Lead'; action.onclick = () => openLeadForm(); }
  else if (name === 'boats') { action.hidden = false; action.textContent = '+ Boat'; action.onclick = () => openBoatForm(); }
  else if (name === 'deals') { action.hidden = false; action.textContent = '+ Deal'; action.onclick = () => openDealForm(); }
  else                       { action.hidden = true; }

  renderCurrentTab();
}

function renderCurrentTab() {
  if      (state.currentTab === 'leads') renderLeadsView();
  else if (state.currentTab === 'boats') renderBoatsView();
  else if (state.currentTab === 'deals') renderDealsView();
}

function updateLeadsBadge() {
  const n = state.leads.filter(needsContact).length;
  ['#leads-badge', '#sidebar-leads-badge'].forEach((sel) => {
    const badge = $(sel); if (!badge) return;
    if (n > 0) { badge.textContent = String(n); badge.hidden = false; }
    else       { badge.hidden = true; }
  });
}

// Sidebar logout + change password (desktop sidebar)
const sideLogout = $('#sidebar-logout');
if (sideLogout) sideLogout.addEventListener('click', logout);

const sideChangePw = $('#sidebar-change-password');
if (sideChangePw) sideChangePw.addEventListener('click', openChangePasswordForm);

function openChangePasswordForm() {
  showSheet(`
    <h2>Change Password</h2>
    <form id="change-pw-form">
      <div class="form-grid">
        <div class="field full">
          <label class="field-label">Current Password</label>
          <input type="password" name="current" required minlength="6" autocomplete="current-password" />
        </div>
        <div class="field full">
          <label class="field-label">New Password</label>
          <input type="password" name="password" required minlength="6" autocomplete="new-password" />
        </div>
        <div class="field full">
          <label class="field-label">Confirm New Password</label>
          <input type="password" name="confirm" required minlength="6" autocomplete="new-password" />
        </div>
      </div>
      <button class="btn-primary gold" type="submit">Update password</button>
      <button type="button" class="btn-secondary" id="cancel-change-pw">Cancel</button>
    </form>
  `);
  $('#cancel-change-pw').onclick = closeSheet;
  $('#change-pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('confirm')) { toast("Passwords don't match", 'error'); return; }
    try {
      await api('POST', '/_change_password', { current: fd.get('current'), password: fd.get('password') });
      closeSheet();
      toast('Password changed');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ──────────────────────────────────────────────────────────────────────
// LEADS
// ──────────────────────────────────────────────────────────────────────
const LEAD_STATUSES   = ['Hot', 'Warm', 'Cold'];
const LEAD_FILTERS    = ['All', 'Hot', 'Warm', 'Cold', 'Need Contact'];
// Salespeople come from /api/users (loaded in reloadAll). See salespersonOptions().
const CONTACT_TYPES   = ['Call', 'Text', 'Email', 'In Person'];

function renderLeadsView() {
  renderLeadStatusStrip();
  renderLeadFilters();
  renderLeadCards();
  $('#lead-search').value = state.leadSearch;
}

function renderLeadStatusStrip() {
  const counts = { Hot: 0, Warm: 0, Cold: 0, Need: 0, FollowToday: 0 };
  for (const l of state.leads) {
    if (LEAD_STATUSES.includes(l.status)) counts[l.status]++;
    if (needsContact(l)) counts.Need++;
    if (parseDate(l.follow_up_date) && shortDate(l.follow_up_date) === shortDate(todayISO()))
      counts.FollowToday++;
  }
  $('#lead-status-strip').innerHTML = `
    <div class="status-card hot"><div class="num">${counts.Hot}</div><div class="lbl">Hot</div></div>
    <div class="status-card warm"><div class="num">${counts.Warm}</div><div class="lbl">Warm</div></div>
    <div class="status-card cold"><div class="num">${counts.Cold}</div><div class="lbl">Cold</div></div>
    <div class="status-card need"><div class="num">${counts.Need}</div><div class="lbl">Need Contact</div></div>
    <div class="status-card follow"><div class="num">${counts.FollowToday}</div><div class="lbl">Follow Today</div></div>
  `;
}

function renderLeadFilters() {
  const total = state.leads.length;
  const html = LEAD_FILTERS.map((f) => {
    const n = f === 'All' ? total
            : f === 'Need Contact' ? state.leads.filter(needsContact).length
            : state.leads.filter((l) => l.status === f).length;
    const icon = f === 'Hot' ? '🔥' : f === 'Warm' ? '🟢' : f === 'Cold' ? '🔵' : f === 'Need Contact' ? '🚩' : '';
    return `<button class="pill ${state.leadFilter === f ? 'active' : ''}" data-filter="${escapeHtml(f)}">
              ${icon ? `<span>${icon}</span>` : ''}<span>${escapeHtml(f)}</span>
              <span class="count">${n}</span>
            </button>`;
  }).join('');
  $('#lead-filter-row').innerHTML = html;
  $$('#lead-filter-row .pill').forEach((p) => {
    p.addEventListener('click', () => { state.leadFilter = p.dataset.filter; renderLeadsView(); });
  });
}

$('#lead-search').addEventListener('input', (e) => {
  state.leadSearch = e.target.value;
  renderLeadCards();
});
$('#boat-search').addEventListener('input', (e) => {
  state.boatSearch = e.target.value;
  renderBoatsView();
});
$('#deal-search').addEventListener('input', (e) => {
  state.dealSearch = e.target.value;
  renderDealsView();
});

function filteredLeads() {
  let xs = state.leads.slice();
  if (state.leadFilter === 'Need Contact') xs = xs.filter(needsContact);
  else if (state.leadFilter !== 'All')     xs = xs.filter((l) => l.status === state.leadFilter);
  if (state.leadSearch.trim()) {
    const q = state.leadSearch.toLowerCase();
    xs = xs.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.boat_interest || '').toLowerCase().includes(q));
  }
  // Sort: needs-contact first, then most recent created.
  xs.sort((a, b) => {
    const an = needsContact(a) ? 0 : 1;
    const bn = needsContact(b) ? 0 : 1;
    if (an !== bn) return an - bn;
    return (b.id || 0) - (a.id || 0);
  });
  return xs;
}

function renderLeadCards() {
  const xs = filteredLeads();
  const root = $('#lead-cards');
  if (!xs.length) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👥</div>
        <div class="empty-title">No leads ${state.leadFilter !== 'All' ? `(${state.leadFilter})` : 'yet'}</div>
        <div>Tap <strong>+ Lead</strong> to add one.</div>
      </div>`;
    return;
  }
  root.innerHTML = xs.map((l) => leadCardHtml(l)).join('');
  $$('.lead-card').forEach((el) => {
    el.addEventListener('click', () => openLeadDetail(Number(el.dataset.id)));
  });
}

function leadCardHtml(l) {
  const lastDays = daysSince(l.last_contact_date);
  const lastLbl  = lastDays == null
    ? (l.first_contact_date ? `Created ${shortDate(l.first_contact_date)}` : 'Never contacted')
    : (lastDays === 0 ? 'Today' : `${lastDays}d ago`);
  const needs = needsContact(l);
  const subParts = [
    l.salesperson || '',
    l.contact_type ? `${l.contact_type} ${shortDate(l.last_contact_date || l.first_contact_date)}` : '',
    l.trade_in ? `Trade: ${l.trade_in}` : '',
  ].filter(Boolean);
  const statusCls = (l.status || 'warm').toLowerCase();
  return `
    <div class="lead-card ${needs ? 'needs-contact' : ''}" data-id="${l.id}">
      <div class="avatar">${escapeHtml(initials(l.name))}</div>
      <div class="lead-body">
        <div class="lead-name">${escapeHtml(l.name || 'Unnamed')} ${needs ? '<span class="flag">🔴</span>' : ''}</div>
        <div class="lead-line">${escapeHtml(l.boat_interest || '—')}</div>
        <div class="lead-sub">${escapeHtml(subParts.join(' · ') || 'No notes')}</div>
      </div>
      <div class="lead-right">
        ${l.status ? `<span class="status-pill ${statusCls}">${escapeHtml(l.status)}</span>` : ''}
        <span class="lead-ago ${lastDays != null && lastDays < 14 ? 'fresh' : ''}">${escapeHtml(lastLbl)}</span>
        ${l.follow_up_date ? `<span class="lead-next">${escapeHtml(shortDate(l.follow_up_date))}</span>` : ''}
      </div>
    </div>`;
}

// ── Lead detail / form ──
async function openLeadDetail(id) {
  const lead = state.leads.find((x) => x.id === id);
  if (!lead) return;

  // Fetch the activity timeline for this lead.
  let activities = [];
  try { activities = await api('GET', `/lead_activities?lead_id=${lead.id}`); }
  catch { /* show timeline as empty */ }

  const timelineHtml = activities.length
    ? `<div class="timeline">${activities.map(activityHtml).join('')}</div>`
    : `<div class="timeline-empty">No contact history yet. Hit <strong>Log Contact</strong> below.</div>`;

  showSheet(`
    <h2>${escapeHtml(lead.name || 'Lead')}</h2>
    <div style="color:var(--muted);font-size:13px;margin-bottom:14px;">
      ${escapeHtml(lead.boat_interest || '')}${lead.budget ? ` · Budget ${money(lead.budget)}` : ''}
    </div>

    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
      ${lead.phone ? `<a class="btn-secondary" style="flex:1;text-decoration:none;text-align:center;" href="tel:${encodeURIComponent(lead.phone)}">📞 Call</a>` : ''}
      ${lead.phone ? `<a class="btn-secondary" style="flex:1;text-decoration:none;text-align:center;" href="sms:${encodeURIComponent(lead.phone)}">💬 Text</a>` : ''}
      ${lead.email ? `<a class="btn-secondary" style="flex:1;text-decoration:none;text-align:center;" href="mailto:${encodeURIComponent(lead.email)}">✉️ Email</a>` : ''}
    </div>

    <div class="summary-card">
      <div class="summary-title">Snapshot</div>
      <div class="summary-row"><span>Status</span><span class="v">${escapeHtml(lead.status || '—')}</span></div>
      <div class="summary-row"><span>Salesperson</span><span class="v">${escapeHtml(lead.salesperson || '—')}</span></div>
      <div class="summary-row"><span>Last contact</span><span class="v">${escapeHtml(lead.last_contact_date ? shortDate(lead.last_contact_date) + ` (${daysSince(lead.last_contact_date)}d ago)` : '—')}</span></div>
      <div class="summary-row"><span>Next follow-up</span><span class="v">${escapeHtml(lead.follow_up_date ? shortDate(lead.follow_up_date) : '—')}</span></div>
      <div class="summary-row"><span>Trade-in</span><span class="v">${escapeHtml(lead.trade_in || '—')}</span></div>
    </div>

    ${lead.notes ? `<div class="field full"><label class="field-label">Notes</label><div style="background:#f6f8fb;border-radius:10px;padding:10px 12px;white-space:pre-wrap;">${escapeHtml(lead.notes)}</div></div>` : ''}

    <div class="section-divider">📜 Activity Timeline</div>
    ${timelineHtml}

    <button class="btn-primary gold" id="btn-log-contact" style="margin-top:14px;">📝 Log Contact</button>
    <button class="btn-secondary" id="btn-add-note">➕ Add Note</button>
    <button class="btn-primary" id="btn-build-deal">🤝 Build Deal</button>
    <div class="btn-row">
      <button class="btn-secondary" id="btn-edit-lead">Edit</button>
      <button class="btn-danger" id="btn-delete-lead">Delete</button>
    </div>
  `);
  $('#btn-log-contact').onclick = () => openLogContactForm(lead);
  $('#btn-add-note').onclick    = () => openAddNoteForm(lead);
  $('#btn-build-deal').onclick  = () => openDealForm(null, lead);
  $('#btn-edit-lead').onclick   = () => openLeadForm(lead);
  $('#btn-delete-lead').onclick = async () => {
    if (!confirm(`Delete ${lead.name}? This can't be undone.`)) return;
    try {
      await api('DELETE', `/leads/${lead.id}`);
      closeSheet();
      await reloadAll();
      toast('Lead deleted');
    } catch (e) { toast(e.message, 'error'); }
  };
}

const ACTIVITY_ICONS = {
  Call:           '📞',
  Text:           '💬',
  Email:          '✉️',
  'In Person':    '🤝',
  Note:           '📝',
  'Status Change':'🔄',
};
function activityHtml(a) {
  const icon = ACTIVITY_ICONS[a.type] || '•';
  const cls  = (a.type || '').toLowerCase().replace(/\s+/g, '_');
  return `
    <div class="timeline-item ${cls}">
      <div class="timeline-head">
        <span>${icon} ${escapeHtml(a.type || 'Activity')}</span>
        <span class="who">· ${escapeHtml(a.user_name || a.user_email || '')}</span>
        <span class="when">${escapeHtml(shortDate(a.occurred_at) || shortDate(a.created_at) || '')}</span>
      </div>
      ${a.note ? `<div class="timeline-note">${escapeHtml(a.note)}</div>` : ''}
    </div>`;
}

async function logActivity(lead, type, note, occurredAt) {
  return api('POST', '/lead_activities', {
    lead_id:     lead.id,
    user_email:  state.currentUser ? state.currentUser.email : null,
    user_name:   state.currentUser ? state.currentUser.name  : null,
    type,
    occurred_at: occurredAt || todayISO(),
    note:        note || null,
  });
}

function openLogContactForm(lead) {
  showSheet(`
    <h2>Log Contact · ${escapeHtml(lead.name)}</h2>
    <form id="log-contact-form">
      <div class="form-grid">
        <div class="field">
          <label class="field-label">Contact Type</label>
          <select name="contact_type">
            ${CONTACT_TYPES.map((t) => `<option ${lead.contact_type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">Date</label>
          <input type="date" name="last_contact_date" value="${todayISO()}" />
        </div>
        <div class="field">
          <label class="field-label">New Status</label>
          <select name="status">
            ${LEAD_STATUSES.map((s) => `<option ${lead.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">Next Follow-Up</label>
          <input type="date" name="follow_up_date" />
        </div>
        <div class="field full">
          <label class="field-label">Note (optional)</label>
          <textarea name="note" placeholder="What was discussed?"></textarea>
        </div>
      </div>
      <button class="btn-primary gold" type="submit">Save Contact</button>
      <button class="btn-secondary" type="button" id="btn-cancel-log">Cancel</button>
    </form>
  `);
  $('#btn-cancel-log').onclick = () => openLeadDetail(lead.id);
  $('#log-contact-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const note         = fd.get('note');
    const contactType  = fd.get('contact_type');
    const date         = fd.get('last_contact_date');
    const newStatus    = fd.get('status');
    const updated = {
      contact_type:      contactType,
      last_contact_date: date,
      status:            newStatus,
      follow_up_date:    fd.get('follow_up_date') || null,
    };
    try {
      await api('PUT', `/leads/${lead.id}`, updated);
      await logActivity(lead, contactType, note, date);
      if (newStatus && newStatus !== lead.status) {
        await logActivity(lead, 'Status Change', `${lead.status || '—'} → ${newStatus}`, date);
      }
      await reloadAll();
      openLeadDetail(lead.id);
      toast('Contact logged');
    } catch (err) { toast(err.message, 'error'); }
  };
}

function openLeadForm(lead) {
  const editing = !!(lead && lead.id);
  const meName = state.currentUser ? state.currentUser.name : 'Jake';
  const l = lead || { status: 'Warm', salesperson: meName, contact_type: 'Call', first_contact_date: todayISO() };
  showSheet(`
    <h2>${editing ? 'Edit Lead' : 'New Lead'}</h2>
    <form id="lead-form">
      <div class="form-grid">
        <div class="field full">
          <label class="field-label">Full Name *</label>
          <input name="name" required placeholder="John Smith" value="${escapeHtml(l.name || '')}" />
        </div>
        <div class="field">
          <label class="field-label">Phone</label>
          <input name="phone" type="tel" placeholder="732-555-0000" value="${escapeHtml(l.phone || '')}" />
        </div>
        <div class="field">
          <label class="field-label">Email</label>
          <input name="email" type="email" placeholder="optional" value="${escapeHtml(l.email || '')}" />
        </div>
        <div class="field">
          <label class="field-label">Budget $</label>
          <input name="budget" type="number" inputmode="decimal" placeholder="145000" value="${escapeHtml(l.budget || '')}" />
        </div>
        <div class="field">
          <label class="field-label">Status</label>
          <select name="status">
            ${LEAD_STATUSES.map((s) => `<option ${l.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field full">
          <label class="field-label">Boat Interest</label>
          <input name="boat_interest" placeholder="2025 Cape Horn 28XS" value="${escapeHtml(l.boat_interest || '')}" />
        </div>
        <div class="field full">
          <label class="field-label">Trade-In (if any)</label>
          <input name="trade_in" placeholder="2019 Grady-White 257" value="${escapeHtml(l.trade_in || '')}" />
        </div>
        <div class="field">
          <label class="field-label">Salesperson</label>
          <select name="salesperson">
            ${salespersonOptions(l.salesperson)}
          </select>
        </div>
        <div class="field">
          <label class="field-label">Contact Type</label>
          <select name="contact_type">
            ${CONTACT_TYPES.map((c) => `<option ${l.contact_type === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">First Contact</label>
          <input name="first_contact_date" type="date" value="${escapeHtml((l.first_contact_date || '').slice(0,10))}" />
        </div>
        <div class="field">
          <label class="field-label">Follow-up Date</label>
          <input name="follow_up_date" type="date" value="${escapeHtml((l.follow_up_date || '').slice(0,10))}" />
        </div>
        <div class="field full">
          <label class="field-label">Notes</label>
          <textarea name="notes" placeholder="What are they looking for? Timeline? Budget details?">${escapeHtml(l.notes || '')}</textarea>
        </div>
      </div>
      <button class="btn-primary gold" type="submit">${editing ? 'Save Lead' : 'Add Lead'}</button>
      <button class="btn-secondary" type="button" id="btn-cancel-lead">Cancel</button>
    </form>
  `);
  $('#btn-cancel-lead').onclick = () => editing ? openLeadDetail(l.id) : closeSheet();
  $('#lead-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    fd.forEach((v, k) => { data[k] = v === '' ? null : v; });
    try {
      let saved;
      if (editing) {
        saved = await api('PUT',  `/leads/${l.id}`, data);
        // Auto-log a status-change activity if the status was edited.
        if (data.status && data.status !== l.status) {
          await logActivity(saved, 'Status Change', `${l.status || '—'} → ${data.status}`);
        }
      } else {
        saved = await api('POST', `/leads`, data);
        // Auto-log creation as the first activity.
        await logActivity(saved, 'Note', `Lead created`);
      }
      await reloadAll();
      closeSheet();
      toast(editing ? 'Lead saved' : 'Lead added');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// Add a free-form note to a lead (separate from contact logging).
function openAddNoteForm(lead) {
  showSheet(`
    <h2>Add Note · ${escapeHtml(lead.name)}</h2>
    <form id="note-form">
      <div class="form-grid">
        <div class="field full">
          <label class="field-label">Date</label>
          <input type="date" name="occurred_at" value="${todayISO()}" />
        </div>
        <div class="field full">
          <label class="field-label">Note</label>
          <textarea name="note" required autofocus placeholder="What happened, what to remember…"></textarea>
        </div>
      </div>
      <button class="btn-primary gold" type="submit">Save Note</button>
      <button class="btn-secondary" type="button" id="btn-cancel-note">Cancel</button>
    </form>
  `);
  $('#btn-cancel-note').onclick = () => openLeadDetail(lead.id);
  $('#note-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await logActivity(lead, 'Note', fd.get('note'), fd.get('occurred_at'));
      await reloadAll();
      openLeadDetail(lead.id);
      toast('Note saved');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ──────────────────────────────────────────────────────────────────────
// BOATS
// ──────────────────────────────────────────────────────────────────────
const BOAT_STATUSES = ['In Stock', 'On Order', 'Sold', 'Service'];
const BOAT_FILTERS  = ['All', 'In Stock', 'On Order', 'Sold'];

function renderBoatsView() {
  const total = state.boats.length;
  $('#boat-filter-row').innerHTML = BOAT_FILTERS.map((f) => {
    const n = f === 'All' ? total : state.boats.filter((b) => b.status === f).length;
    return `<button class="pill ${state.boatFilter === f ? 'active' : ''}" data-filter="${escapeHtml(f)}">
              ${escapeHtml(f)} <span class="count">${n}</span>
            </button>`;
  }).join('');
  $$('#boat-filter-row .pill').forEach((p) => {
    p.addEventListener('click', () => { state.boatFilter = p.dataset.filter; renderBoatsView(); });
  });
  $('#boat-search').value = state.boatSearch;

  let xs = state.boats.slice();
  if (state.boatFilter !== 'All') xs = xs.filter((b) => b.status === state.boatFilter);
  if (state.boatSearch.trim()) {
    const q = state.boatSearch.toLowerCase();
    xs = xs.filter((b) => [
      b.year, b.make, b.model, b.stock_number, b.location,
    ].some((v) => String(v || '').toLowerCase().includes(q)));
  }
  xs.sort((a, b) => (b.id || 0) - (a.id || 0));

  const root = $('#boat-cards');
  if (!xs.length) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🛥️</div>
        <div class="empty-title">No boats yet</div>
        <div>Tap <strong>+ Boat</strong> to add inventory.</div>
      </div>`;
    return;
  }
  root.innerHTML = xs.map((b) => `
    <div class="lead-card" data-id="${b.id}">
      <div class="avatar gold">🛥️</div>
      <div class="lead-body">
        <div class="lead-name">${escapeHtml([b.year, b.make, b.model].filter(Boolean).join(' ') || 'Unnamed boat')}</div>
        <div class="lead-sub">${b.stock_number ? 'Stock #' + escapeHtml(b.stock_number) : ''}${b.location ? ' · ' + escapeHtml(b.location) : ''}</div>
      </div>
      <div class="lead-right">
        ${b.status ? `<span class="status-pill ${b.status === 'Sold' ? 'warm' : 'cold'}">${escapeHtml(b.status)}</span>` : ''}
        <span class="lead-ago fresh">${b.price ? moneyShort(b.price) : ''}</span>
      </div>
    </div>
  `).join('');
  $$('#boat-cards .lead-card').forEach((el) => {
    el.addEventListener('click', () => openBoatForm(state.boats.find((x) => x.id === Number(el.dataset.id))));
  });
}

function openBoatForm(boat) {
  const editing = !!(boat && boat.id);
  const b = boat || { status: 'In Stock' };
  showSheet(`
    <h2>${editing ? 'Edit Boat' : 'New Boat'}</h2>
    <form id="boat-form">
      <div class="form-grid">
        <div class="field"><label class="field-label">Year</label>
          <input name="year" type="number" inputmode="numeric" placeholder="2025" value="${escapeHtml(b.year || '')}" /></div>
        <div class="field"><label class="field-label">Stock #</label>
          <input name="stock_number" placeholder="SH-12345" value="${escapeHtml(b.stock_number || '')}" /></div>
        <div class="field"><label class="field-label">Make</label>
          <input name="make" placeholder="Cape Horn" value="${escapeHtml(b.make || '')}" /></div>
        <div class="field"><label class="field-label">Model</label>
          <input name="model" placeholder="28XS" value="${escapeHtml(b.model || '')}" /></div>
        <div class="field"><label class="field-label">Price $</label>
          <input name="price" type="number" inputmode="decimal" placeholder="145000" value="${escapeHtml(b.price || '')}" /></div>
        <div class="field"><label class="field-label">Cost $</label>
          <input name="cost" type="number" inputmode="decimal" placeholder="125000" value="${escapeHtml(b.cost || '')}" /></div>
        <div class="field"><label class="field-label">Status</label>
          <select name="status">${BOAT_STATUSES.map((s) => `<option ${b.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label class="field-label">Location</label>
          <input name="location" placeholder="Showroom" value="${escapeHtml(b.location || '')}" /></div>
        <div class="field full"><label class="field-label">Notes</label>
          <textarea name="notes" placeholder="Equipment, photos link, etc.">${escapeHtml(b.notes || '')}</textarea></div>
      </div>
      <button class="btn-primary gold" type="submit">${editing ? 'Save Boat' : 'Add Boat'}</button>
      ${editing ? `<button class="btn-danger" type="button" id="btn-del-boat" style="margin-top:8px;">Delete</button>` : ''}
      <button class="btn-secondary" type="button" id="btn-cancel-boat">Cancel</button>
    </form>
  `);
  $('#btn-cancel-boat').onclick = closeSheet;
  if (editing) {
    $('#btn-del-boat').onclick = async () => {
      if (!confirm('Delete this boat?')) return;
      await api('DELETE', `/boats/${b.id}`); await reloadAll(); closeSheet(); toast('Boat deleted');
    };
  }
  $('#boat-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    fd.forEach((v, k) => { data[k] = v === '' ? null : v; });
    try {
      if (editing) await api('PUT', `/boats/${b.id}`, data);
      else         await api('POST', `/boats`, data);
      await reloadAll(); closeSheet(); toast(editing ? 'Boat saved' : 'Boat added');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ──────────────────────────────────────────────────────────────────────
// DEALS
// ──────────────────────────────────────────────────────────────────────
const DEAL_STATUSES = ['Active', 'Sold', 'Lost'];
const DEAL_FILTERS  = ['All', 'Active', 'Sold', 'Lost'];

function renderDealsView() {
  const total = state.deals.length;
  $('#deal-filter-row').innerHTML = DEAL_FILTERS.map((f) => {
    const n = f === 'All' ? total : state.deals.filter((d) => d.status === f).length;
    const ic = f === 'Active' ? '🤝' : f === 'Sold' ? '✅' : f === 'Lost' ? '❌' : '';
    return `<button class="pill ${state.dealFilter === f ? 'active' : ''}" data-filter="${escapeHtml(f)}">
              ${ic ? `<span>${ic}</span>` : ''}<span>${escapeHtml(f)}</span>
              <span class="count">${n}</span>
            </button>`;
  }).join('');
  $$('#deal-filter-row .pill').forEach((p) => {
    p.addEventListener('click', () => { state.dealFilter = p.dataset.filter; renderDealsView(); });
  });
  $('#deal-search').value = state.dealSearch;

  let xs = state.deals.slice();
  if (state.dealFilter !== 'All') xs = xs.filter((d) => d.status === state.dealFilter);
  if (state.dealSearch.trim()) {
    const q = state.dealSearch.toLowerCase();
    xs = xs.filter((d) =>
      (d.customer_name || '').toLowerCase().includes(q) ||
      (d.boat || '').toLowerCase().includes(q));
  }
  xs.sort((a, b) => (b.id || 0) - (a.id || 0));

  const root = $('#deal-cards');
  if (!xs.length) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🤝</div>
        <div class="empty-title">No deals yet</div>
        <div>Tap <strong>+ Deal</strong>, or open a lead and tap <strong>Build Deal</strong>.</div>
      </div>`;
    return;
  }
  root.innerHTML = xs.map((d) => {
    const t = computeDealTotals(d);
    return `
      <div class="lead-card" data-id="${d.id}">
        <div class="avatar">${escapeHtml(initials(d.customer_name))}</div>
        <div class="lead-body">
          <div class="lead-name">${escapeHtml(d.customer_name || 'Unnamed customer')}</div>
          <div class="lead-line">${escapeHtml(d.boat || '—')}</div>
          <div class="lead-sub">${escapeHtml(d.salesperson || '')}${d.sale_date ? ' · ' + shortDate(d.sale_date) : ''}</div>
        </div>
        <div class="lead-right">
          ${d.status ? `<span class="status-pill ${d.status === 'Sold' ? 'warm' : d.status === 'Lost' ? 'hot' : 'cold'}">${escapeHtml(d.status)}</span>` : ''}
          <span class="lead-ago fresh">${moneyShort(t.profit)}</span>
          <span class="lead-next">${t.margin.toFixed(1)}%</span>
        </div>
      </div>`;
  }).join('');
  $$('#deal-cards .lead-card').forEach((el) => {
    el.addEventListener('click', () => openDealForm(state.deals.find((x) => x.id === Number(el.dataset.id))));
  });
}

function computeDealTotals(d) {
  const num = (k) => Number(d[k]) || 0;
  const revenue = num('selling_price') + num('doc_fees') + num('finance_reserve') + num('trade_recouped');
  const costs   = num('invoice_cost') + num('trade_allowance') + num('rigging_prep') + num('other_costs');
  const profit  = revenue - costs;
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, costs, profit, margin };
}

function openDealForm(deal, fromLead) {
  const editing = !!(deal && deal.id);
  const d = deal || (fromLead ? {
    customer_name: fromLead.name,
    boat:          fromLead.boat_interest,
    salesperson:   fromLead.salesperson,
    sale_date:     todayISO(),
    status:        'Active',
    lead_id:       fromLead.id,
  } : { status: 'Active', salesperson: state.currentUser?.name || 'Jake', sale_date: todayISO() });

  const numField = (n, lbl, ph) => `
    <div class="field"><label class="field-label">${lbl}</label>
      <input name="${n}" type="number" inputmode="decimal" placeholder="${ph}" value="${escapeHtml(d[n] || '')}" data-recalc /></div>`;

  showSheet(`
    <h2>${editing ? 'Edit Deal' : 'New Deal'}</h2>
    <form id="deal-form">
      <div class="form-grid">
        <div class="field full"><label class="field-label">Customer Name</label>
          <input name="customer_name" required placeholder="Customer name" value="${escapeHtml(d.customer_name || '')}" /></div>
        <div class="field full"><label class="field-label">Boat</label>
          <input name="boat" placeholder="2025 Cape Horn 28XS" value="${escapeHtml(d.boat || '')}" /></div>
        <div class="field"><label class="field-label">Salesperson</label>
          <select name="salesperson">${salespersonOptions(d.salesperson)}</select></div>
        <div class="field"><label class="field-label">Sale Date</label>
          <input name="sale_date" type="date" value="${escapeHtml((d.sale_date || todayISO()).slice(0,10))}" /></div>
      </div>

      <div class="section-divider">💰 Revenue</div>
      <div class="form-grid">
        ${numField('selling_price',   'Selling Price $',   '145000')}
        ${numField('doc_fees',        'Doc / Fees $',      '799')}
        ${numField('finance_reserve', 'Finance Reserve $', '0')}
        ${numField('trade_recouped',  'Trade Recouped $',  '0')}
      </div>

      <div class="section-divider">📦 Costs</div>
      <div class="form-grid">
        ${numField('invoice_cost',    'Invoice / Cost $',  '125000')}
        ${numField('trade_allowance', 'Trade Allowance $', '0')}
        ${numField('rigging_prep',    'Rigging / Prep $',  '0')}
        ${numField('other_costs',     'Other Costs $',     '0')}
      </div>

      <div class="summary-card" id="deal-summary">
        <div class="summary-title">Deal Summary</div>
        <div class="summary-row"><span>Total Revenue</span><span class="v" id="d-rev">--</span></div>
        <div class="summary-row"><span>Total Costs</span><span class="v" id="d-cost">--</span></div>
        <div class="summary-row"><span>Gross Profit $</span><span class="v profit" id="d-profit">--</span></div>
        <div class="summary-row"><span>Gross Margin</span><span class="v margin" id="d-margin">0%</span></div>
      </div>

      <div class="form-grid">
        <div class="field full"><label class="field-label">Deal Status</label>
          <select name="status">${DEAL_STATUSES.map((s) => `<option ${d.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field full"><label class="field-label">Notes</label>
          <textarea name="notes" placeholder="Any deal notes…">${escapeHtml(d.notes || '')}</textarea></div>
      </div>

      <button class="btn-primary gold" type="submit">💾 ${editing ? 'Save Deal' : 'Save Deal'}</button>
      ${editing ? `<button class="btn-danger" type="button" id="btn-del-deal" style="margin-top:8px;">Delete</button>` : ''}
      <button class="btn-secondary" type="button" id="btn-cancel-deal">Cancel</button>
    </form>
  `);

  function recalc() {
    const fd = new FormData($('#deal-form'));
    const data = {};
    fd.forEach((v, k) => { data[k] = v; });
    const t = computeDealTotals(data);
    $('#d-rev').textContent    = money(t.revenue);
    $('#d-cost').textContent   = money(t.costs);
    $('#d-profit').textContent = money(t.profit);
    $('#d-margin').textContent = t.margin.toFixed(1) + '%';
  }
  $$('#deal-form [data-recalc]').forEach((el) => el.addEventListener('input', recalc));
  recalc();

  $('#btn-cancel-deal').onclick = closeSheet;
  if (editing) {
    $('#btn-del-deal').onclick = async () => {
      if (!confirm('Delete this deal?')) return;
      await api('DELETE', `/deals/${d.id}`); await reloadAll(); closeSheet(); toast('Deal deleted');
    };
  }
  $('#deal-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    fd.forEach((v, k) => { data[k] = v === '' ? null : v; });
    if (d.lead_id && !data.lead_id) data.lead_id = d.lead_id;
    try {
      if (editing) await api('PUT', `/deals/${d.id}`, data);
      else         await api('POST', `/deals`, data);
      await reloadAll(); closeSheet(); toast(editing ? 'Deal saved' : 'Deal added');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ──────────────────────────────────────────────────────────────────────
// TOOLS
// ──────────────────────────────────────────────────────────────────────

// Collapsible tool cards
$$('.tool-card .tool-head').forEach((h) => {
  h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
});
// Open the first one by default.
$('.tool-card').classList.add('open');

// ── Payment Calculator ──
function recalcPayment() {
  const price = +$('#pc-price').value || 0;
  const down  = +$('#pc-down').value  || 0;
  const trade = +$('#pc-trade').value || 0;
  const rate  = +$('#pc-rate').value  || 0;
  const term  = +$('#pc-term').value  || 0;
  const tax   = +$('#pc-tax').value   || 0;
  const fees  = +$('#pc-fees').value  || 0;

  const root = $('#pc-result');
  if (!price || !rate || !term) {
    root.innerHTML = `<div class="label">Enter price, rate, and term to calculate</div>`;
    return;
  }
  const taxAmt    = (price - trade) * (tax / 100);
  const financed  = price + taxAmt + fees - down - trade;
  if (financed <= 0) {
    root.innerHTML = `<div class="label">Financed amount is $0 — paid in full at signing.</div>`;
    return;
  }
  const r = (rate / 100) / 12;
  const monthly = r === 0 ? financed / term
                          : financed * (r * Math.pow(1 + r, term)) / (Math.pow(1 + r, term) - 1);
  const total    = monthly * term;
  const interest = total - financed;
  root.innerHTML = `
    <div class="label">Estimated Monthly Payment</div>
    <div class="big">${money(monthly)}<span style="font-size:14px;color:var(--gold);"> /mo</span></div>
    <div class="breakdown">
      <span>Sales Tax</span><b>${money(taxAmt)}</b>
      <span>Amount Financed</span><b>${money(financed)}</b>
      <span>Total Interest</span><b>${money(interest)}</b>
      <span>Total of Payments</span><b>${money(total)}</b>
    </div>`;
}
['pc-price','pc-down','pc-trade','pc-rate','pc-term','pc-tax','pc-fees']
  .forEach((id) => $('#'+id).addEventListener('input', recalcPayment));

// ── Trade-In Appraisal ──
function recalcAppraisal() {
  const buc  = +$('#ap-buc').value  || 0;
  const nada = +$('#ap-nada').value || 0;
  const comp = +$('#ap-comp').value || 0;
  const cond = $('#ap-cond').value;
  const hours = +$('#ap-hours').value || 0;

  const root = $('#ap-result');
  if (!buc && !nada && !comp) {
    root.innerHTML = `<div class="label">Enter BUC FMV or NADA Retail to calculate</div>`;
    return;
  }
  const condMult  = { Excellent: 1.05, Good: 1.0, Fair: 0.92, Rough: 0.82 }[cond] || 1.0;
  const hoursMult = hours > 1500 ? 0.92 : hours > 800 ? 0.97 : 1.0;
  const all = [buc, nada, comp].filter((x) => x > 0);
  const lowBase  = Math.min(...all);
  const highBase = Math.max(...all);
  const offerLow  = Math.round(lowBase  * 0.82 * condMult * hoursMult);
  const offerHigh = Math.round(highBase * 0.92 * condMult * hoursMult);
  const wholesale = Math.round(((buc || nada || comp) * 0.78) * condMult * hoursMult);
  const retail    = Math.round((highBase * 1.04) * condMult);
  root.innerHTML = `
    <div class="label">Suggested Offer Range</div>
    <div class="big">${money(offerLow)} – ${money(offerHigh)}</div>
    <div class="breakdown">
      <span>Wholesale Floor</span><b>${money(wholesale)}</b>
      <span>Likely Retail Ask</span><b>${money(retail)}</b>
      <span>Condition Adj.</span><b>×${condMult.toFixed(2)}</b>
      <span>Hours Adj.</span><b>×${hoursMult.toFixed(2)}</b>
    </div>`;
}
['ap-buc','ap-nada','ap-comp','ap-cond','ap-hours','ap-year','ap-model']
  .forEach((id) => $('#'+id).addEventListener('input', recalcAppraisal));

// ── Electronics Builder ──
//
// Three brands × three packages. Each package is a fixed list of items with
// estimated parts prices (the parts guy gets actual SKU/pricing on order).
// Add-ons are independent toggles that layer onto any package; brand-specific
// add-ons (extra MFD, autopilot, open array upgrade) auto-pick the right SKU
// for the selected brand. Output is a printable / copy-able order sheet.
//
// Tweak the package contents or prices below to match your real catalog —
// nothing else needs to change.

const ELECTRONICS_PACKAGES = {
  Simrad: {
    Basic: { label: 'Basic', items: [
      { name: '12" Simrad NSS Evo3 MFD',                 qty: 1, price: 2200 },
      { name: 'Simrad RS40 VHF Radio',                   qty: 1, price: 450  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
      { name: 'Simrad HALO20+ Dome Radar',               qty: 1, price: 2200 },
    ]},
    Mid: { label: 'Mid Range', items: [
      { name: '16" Simrad NSS Evo3 MFD',                 qty: 1, price: 4200 },
      { name: 'Simrad HALO20+ Dome Radar',               qty: 1, price: 2200 },
      { name: 'Simrad RS40 VHF Radio',                   qty: 1, price: 450  },
      { name: 'Fusion Apollo MS-RA770 Stereo',           qty: 1, price: 700  },
      { name: 'Marine Speakers',                         qty: 6, price: 120  },
      { name: 'Marine Amplifier',                        qty: 1, price: 600  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
    ]},
    Top: { label: 'Top Tier', items: [
      { name: '16" Simrad NSS Evo4 MFD',                 qty: 2, price: 4500 },
      { name: 'Simrad HALO 2003 Open Array Radar',       qty: 1, price: 6200 },
      { name: 'Simrad RS100-B VHF Radio (with AIS)',     qty: 1, price: 1100 },
      { name: 'Simrad RS40 VHF Radio',                   qty: 1, price: 450  },
      { name: 'Fusion Apollo MS-RA770 Stereo',           qty: 1, price: 700  },
      { name: 'Marine Speakers',                         qty: 6, price: 120  },
      { name: 'Marine Amplifier',                        qty: 1, price: 600  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
    ]},
  },
  Garmin: {
    Basic: { label: 'Basic', items: [
      { name: '12" Garmin GPSMAP 1243xsv MFD',           qty: 1, price: 2400 },
      { name: 'Garmin VHF 215 Radio',                    qty: 1, price: 450  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
      { name: 'Garmin GMR 18 HD3+ Dome Radar',           qty: 1, price: 1800 },
    ]},
    Mid: { label: 'Mid Range', items: [
      { name: '16" Garmin GPSMAP 8616xsv MFD',           qty: 1, price: 4500 },
      { name: 'Garmin GMR 18 HD3+ Dome Radar',           qty: 1, price: 1800 },
      { name: 'Garmin VHF 215 Radio',                    qty: 1, price: 450  },
      { name: 'Fusion Apollo MS-RA770 Stereo',           qty: 1, price: 700  },
      { name: 'Marine Speakers',                         qty: 6, price: 120  },
      { name: 'Marine Amplifier',                        qty: 1, price: 600  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
    ]},
    Top: { label: 'Top Tier', items: [
      { name: '16" Garmin GPSMAP 8616xsv MFD',           qty: 2, price: 4500 },
      { name: 'Garmin GMR Fantom 124 Open Array Radar',  qty: 1, price: 6500 },
      { name: 'Garmin VHF 315 (with AIS)',               qty: 1, price: 850  },
      { name: 'Garmin VHF 215 Radio',                    qty: 1, price: 450  },
      { name: 'Fusion Apollo MS-RA770 Stereo',           qty: 1, price: 700  },
      { name: 'Marine Speakers',                         qty: 6, price: 120  },
      { name: 'Marine Amplifier',                        qty: 1, price: 600  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
    ]},
  },
  Raymarine: {
    Basic: { label: 'Basic', items: [
      { name: '12" Raymarine Axiom+ 12 MFD',             qty: 1, price: 2300 },
      { name: 'Raymarine Ray73 VHF Radio',               qty: 1, price: 550  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
      { name: 'Raymarine Quantum 2 Q24D Dome Radar',     qty: 1, price: 2400 },
    ]},
    Mid: { label: 'Mid Range', items: [
      { name: '16" Raymarine Axiom XL 16 MFD',           qty: 1, price: 4400 },
      { name: 'Raymarine Quantum 2 Q24D Dome Radar',     qty: 1, price: 2400 },
      { name: 'Raymarine Ray73 VHF Radio',               qty: 1, price: 550  },
      { name: 'Fusion Apollo MS-RA770 Stereo',           qty: 1, price: 700  },
      { name: 'Marine Speakers',                         qty: 6, price: 120  },
      { name: 'Marine Amplifier',                        qty: 1, price: 600  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
    ]},
    Top: { label: 'Top Tier', items: [
      { name: '16" Raymarine Axiom XL 16 MFD',           qty: 2, price: 4400 },
      { name: 'Raymarine Magnum 4kW Open Array Radar',   qty: 1, price: 6800 },
      { name: 'Raymarine Ray90 VHF (with AIS)',          qty: 1, price: 950  },
      { name: 'Raymarine Ray73 VHF Radio',               qty: 1, price: 550  },
      { name: 'Fusion Apollo MS-RA770 Stereo',           qty: 1, price: 700  },
      { name: 'Marine Speakers',                         qty: 6, price: 120  },
      { name: 'Marine Amplifier',                        qty: 1, price: 600  },
      { name: 'Airmar B175HW Thru-Hull Transducer',      qty: 1, price: 750  },
    ]},
  },
};

const ELECTRONICS_ADDONS = [
  { id: 'mfd12_extra',    label: 'Additional 12" MFD',                    qty: 1, price: 2200,
    byBrand: { Simrad: '12" Simrad NSS Evo3 MFD',  Garmin: '12" Garmin GPSMAP 1243xsv MFD',  Raymarine: '12" Raymarine Axiom+ 12 MFD' } },
  { id: 'mfd16_extra',    label: 'Additional 16" MFD',                    qty: 1, price: 4500,
    byBrand: { Simrad: '16" Simrad NSS Evo3 MFD',  Garmin: '16" Garmin GPSMAP 8616xsv MFD', Raymarine: '16" Raymarine Axiom XL 16 MFD' } },
  { id: 'autopilot',      label: 'Autopilot System',                      qty: 1, price: 4500,
    byBrand: { Simrad: 'Simrad Continuum Autopilot', Garmin: 'Garmin Reactor 40 Autopilot', Raymarine: 'Raymarine Evolution EV-200 Autopilot' } },
  { id: 'open_array_up',  label: 'Upgrade Dome → Open Array Radar',       qty: 1, price: 3500,
    byBrand: { Simrad: 'Simrad HALO 2003 Open Array (upgrade)', Garmin: 'Garmin GMR Fantom 124 Open Array (upgrade)', Raymarine: 'Raymarine Magnum 4kW Open Array (upgrade)' } },
  { id: 'transom_xducer', label: 'Transom-Mount Transducer',              qty: 1, price: 450, name: 'Airmar TM275LH-W Transom-Mount Transducer' },
  { id: 'audio_pkg',      label: 'Add Audio Package (Stereo + 6 Spkr + Amp)', qty: 1, price: 2020,
    name: 'Fusion Apollo MS-RA770 + 6× Marine Speakers + Marine Amplifier (full audio package)' },
  { id: 'flir_m232',      label: 'FLIR M232 Thermal Night Vision Camera', qty: 1, price: 3700, name: 'FLIR M232 Thermal Night Vision Camera' },
  { id: 'sionyx_nightwave', label: 'SiOnyx Nightwave Low-Light Camera',   qty: 1, price: 1700, name: 'SiOnyx Nightwave Color Low-Light Camera' },
  { id: 'black_oak_lightbar', label: 'Black Oak Low-Profile LED Lightbar',qty: 1, price: 950,  name: 'Black Oak Low-Profile LED Lightbar' },
  { id: 'starlink_mini',  label: 'Starlink Mini',                         qty: 1, price: 700,  name: 'Starlink Mini Satellite Internet' },
  { id: 'humphree_27plus', label: 'Humphree Lightning L300 Trim Tabs — Ultimate Pkg (27ft+)', qty: 1, price: 13500,
    name: 'Humphree Lightning L300 Trim Tabs — Ultimate Package (boats 27ft+)' },
  { id: 'humphree_under27', label: 'Humphree Lightning L300 Trim Tabs — w/ Cruise Pkg (under 27ft)', qty: 1, price: 7500,
    name: 'Humphree Lightning L300 Trim Tabs + Cruise Package (boats under 27ft)' },
];

let elBrand  = 'Simrad';
let elPreset = 'Basic';
const elSelectedAddons = new Set();

function elAddonName(addon) {
  if (addon.byBrand) return addon.byBrand[elBrand] || addon.label;
  return addon.name || addon.label;
}

function renderAddons() {
  const root = $('#el-addons');
  root.innerHTML = ELECTRONICS_ADDONS.map((a) => {
    const checked = elSelectedAddons.has(a.id);
    return `
      <label class="addon-row ${checked ? 'checked' : ''}">
        <input type="checkbox" data-addon="${a.id}" ${checked ? 'checked' : ''} />
        <span class="addon-name">${escapeHtml(a.label)}</span>
        <span class="addon-price">${money(a.price)}</span>
      </label>`;
  }).join('');
  $$('#el-addons input').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.addon;
      if (cb.checked) elSelectedAddons.add(id); else elSelectedAddons.delete(id);
      renderAddons();
      renderOrderSheet();
    });
  });
}

function buildOrderItems() {
  const pkg = ELECTRONICS_PACKAGES[elBrand][elPreset];
  const base = pkg.items.map((i) => ({ ...i }));
  const add  = ELECTRONICS_ADDONS
    .filter((a) => elSelectedAddons.has(a.id))
    .map((a) => ({ name: elAddonName(a), qty: a.qty, price: a.price }));
  return base.concat(add);
}

function renderOrderSheet() {
  const pkg      = ELECTRONICS_PACKAGES[elBrand][elPreset];
  const items    = buildOrderItems();
  const total    = items.reduce((s, i) => s + i.price * i.qty, 0);
  const customer = ($('#el-customer').value || '').trim() || '—';
  const boat     = ($('#el-boat').value     || '').trim() || '—';
  const date     = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  $('#el-order-sheet').innerHTML = `
    <div class="order-sheet">
      <h3>📋 Order Sheet — ${escapeHtml(elBrand)} ${escapeHtml(pkg.label)}</h3>
      <div class="sheet-meta">
        <strong>${escapeHtml(customer)}</strong> &middot; ${escapeHtml(boat)} &middot; ${escapeHtml(date)}
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th class="qty">Qty</th><th class="price">Est. $</th></tr>
        </thead>
        <tbody>
          ${items.map((i) => `
            <tr>
              <td>${escapeHtml(i.name)}</td>
              <td class="qty">${i.qty}</td>
              <td class="price">${money(i.price * i.qty)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>Estimated Total — parts only, excl. labor</td>
            <td class="qty"></td>
            <td class="price">${money(total)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="actions">
        <button type="button" class="btn-secondary" id="el-copy">📋 Copy</button>
        <button type="button" class="btn-secondary" id="el-print">🖨️ Print</button>
        <button type="button" class="btn-primary gold"  id="el-save">💾 Save to Customer</button>
      </div>
    </div>`;

  $('#el-copy').onclick  = () => copyOrderSheet(items, total, customer, boat);
  $('#el-print').onclick = () => window.print();
  $('#el-save').onclick  = async () => {
    const c = ($('#el-customer').value || '').trim();
    if (!c) { toast('Enter a customer name first', 'error'); return; }
    try {
      await api('POST', '/electronics_builds', {
        customer_name: c,
        boat:          ($('#el-boat').value || '').trim(),
        brand:         elBrand,
        preset:        pkg.label,
        total,
        items:         JSON.stringify(items),
      });
      toast('Build saved to customer profile');
    } catch (e) { toast(e.message, 'error'); }
  };
}

function copyOrderSheet(items, total, customer, boat) {
  const lines = [
    'Seaport Inlet Marina — Electronics Order Sheet',
    `Date:     ${new Date().toLocaleDateString('en-US')}`,
    `Customer: ${customer}`,
    `Boat:     ${boat}`,
    `Brand:    ${elBrand}`,
    `Package:  ${ELECTRONICS_PACKAGES[elBrand][elPreset].label}`,
    '',
    'Items:',
    ...items.map((i) => `  ${String(i.qty).padStart(2)}x  ${i.name}  (est ${money(i.price * i.qty)})`),
    '',
    `ESTIMATED TOTAL (parts only, excl. labor): ${money(total)}`,
  ];
  const text = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast('Order sheet copied'),
      () => toast('Copy failed — long-press to copy manually', 'error')
    );
  } else {
    toast('Clipboard not available — use Print instead', 'error');
  }
}

$$('#el-brand .choice').forEach((b) => {
  b.addEventListener('click', () => {
    elBrand = b.dataset.v;
    $$('#el-brand .choice').forEach((c) => c.classList.toggle('active', c === b));
    renderAddons();
    renderOrderSheet();
  });
});
$$('#el-preset .choice').forEach((b) => {
  b.addEventListener('click', () => {
    elPreset = b.dataset.v;
    $$('#el-preset .choice').forEach((c) => c.classList.toggle('active', c === b));
    renderOrderSheet();
  });
});
$('#el-customer').addEventListener('input', renderOrderSheet);
$('#el-boat').addEventListener('input', renderOrderSheet);

renderAddons();
renderOrderSheet();
recalcPayment();
recalcAppraisal();

// ── Kick it off ────────────────────────────────────────────────────────
boot();
