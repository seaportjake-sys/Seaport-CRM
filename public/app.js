// Seaport Inlet Marina — Sales Platform frontend.
// Mobile-first. Vanilla JS. No build step.
//
// Data model is in server/entities.js. The frontend has hand-built views per
// tab so the brand layout/feel matches the previous design rather than being
// auto-generated.

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  authRequired: false,
  authed:       true,

  leads:  [],
  boats:  [],
  deals:  [],

  currentTab:  'leads',
  leadFilter:  'All',     // All / Hot / Warm / Cold / Need Contact
  boatFilter:  'All',     // All / In Stock / Sold / On Order
  dealFilter:  'All',     // All / Active / Sold / Lost
  leadSearch:  '',
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

// ── Auth ───────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const r = await fetch('/api/_authcheck').then((x) => x.json());
    state.authRequired = !!r.authRequired;
    state.authed       = !!r.authed;
    if (state.authRequired && !state.authed) { showLogin(); return false; }
    hideLogin();
    return true;
  } catch (e) {
    toast('Could not reach the server', 'error');
    return false;
  }
}
function showLogin() { $('#login-overlay').hidden = false; setTimeout(() => $('#login-password').focus(), 50); }
function hideLogin() { $('#login-overlay').hidden = true; }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  try {
    await api('POST', '/_login', { password: $('#login-password').value });
    hideLogin();
    boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});

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
  if (!await checkAuth()) return;

  // Try to swap in a real logo if one was uploaded to /logo.png.
  fetch('/logo.png', { method: 'HEAD' }).then((r) => {
    if (r.ok) {
      $('#brand-logo').innerHTML = '<img src="/logo.png" alt="Seaport Inlet Marina" />';
    }
  }).catch(() => {});

  await reloadAll();
  switchTab(location.hash.replace(/^#\//, '') || 'leads');
}

async function reloadAll() {
  const [leads, boats, deals] = await Promise.all([
    api('GET', '/leads').catch(() => []),
    api('GET', '/boats').catch(() => []),
    api('GET', '/deals').catch(() => []),
  ]);
  state.leads = leads;
  state.boats = boats;
  state.deals = deals;
  updateLeadsBadge();
  renderCurrentTab();
}

// ── Bottom nav ─────────────────────────────────────────────────────────
$$('#bottombar .nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  if (!['leads','boats','deals','tools'].includes(name)) name = 'leads';
  state.currentTab = name;
  history.replaceState(null, '', '#/' + name);

  $$('.tab-page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
  $$('#bottombar .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));

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
  const badge = $('#leads-badge');
  if (n > 0) { badge.textContent = String(n); badge.hidden = false; }
  else       { badge.hidden = true; }
}

// ──────────────────────────────────────────────────────────────────────
// LEADS
// ──────────────────────────────────────────────────────────────────────
const LEAD_STATUSES   = ['Hot', 'Warm', 'Cold'];
const LEAD_FILTERS    = ['All', 'Hot', 'Warm', 'Cold', 'Need Contact'];
const SALESPEOPLE     = ['Jake', 'Rob', 'Other'];
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
function openLeadDetail(id) {
  const lead = state.leads.find((x) => x.id === id);
  if (!lead) return;
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

    <button class="btn-primary gold" id="btn-log-contact">📝 Log Contact</button>
    <button class="btn-primary" id="btn-build-deal">🤝 Build Deal</button>
    <div class="btn-row">
      <button class="btn-secondary" id="btn-edit-lead">Edit</button>
      <button class="btn-danger" id="btn-delete-lead">Delete</button>
    </div>
  `);
  $('#btn-log-contact').onclick = () => openLogContactForm(lead);
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
    const note = fd.get('note');
    const updated = {
      contact_type:      fd.get('contact_type'),
      last_contact_date: fd.get('last_contact_date'),
      status:            fd.get('status'),
      follow_up_date:    fd.get('follow_up_date') || null,
      notes: note ? `${shortDate(fd.get('last_contact_date'))} (${fd.get('contact_type')}): ${note}\n\n${lead.notes || ''}`.trim() : lead.notes,
    };
    try {
      await api('PUT', `/leads/${lead.id}`, updated);
      await reloadAll();
      closeSheet();
      toast('Contact logged');
    } catch (err) { toast(err.message, 'error'); }
  };
}

function openLeadForm(lead) {
  const editing = !!(lead && lead.id);
  const l = lead || { status: 'Warm', salesperson: 'Jake', contact_type: 'Call', first_contact_date: todayISO() };
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
            ${SALESPEOPLE.map((s) => `<option ${l.salesperson === s ? 'selected' : ''}>${s}</option>`).join('')}
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
      if (editing) await api('PUT',  `/leads/${l.id}`, data);
      else         await api('POST', `/leads`, data);
      await reloadAll();
      closeSheet();
      toast(editing ? 'Lead saved' : 'Lead added');
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

  let xs = state.boats.slice();
  if (state.boatFilter !== 'All') xs = xs.filter((b) => b.status === state.boatFilter);
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

  let xs = state.deals.slice();
  if (state.dealFilter !== 'All') xs = xs.filter((d) => d.status === state.dealFilter);
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
  } : { status: 'Active', salesperson: 'Jake', sale_date: todayISO() });

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
          <select name="salesperson">${SALESPEOPLE.map((s) => `<option ${d.salesperson === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
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
const ELECTRONICS_PRESETS = {
  Simrad: {
    'Basic':         { total: 6500,  items: ['NSS9 Evo3S MFD', 'HALO20+ Radar', 'V60 VHF', 'B164 Transducer'] },
    'Mid Range':     { total: 14800, items: ['NSS12 Evo3S MFD', 'HALO 2003 Open Array', 'IS42 Instruments', 'AP44 Autopilot'] },
    'Full Offshore': { total: 32500, items: ['Dual NSS16 Evo3S', 'HALO 3006 6\' Radar', 'NAIS-500 AIS', 'AP70 Autopilot', 'StructureScan 3D'] },
    'Custom':        { total: 0,     items: [] },
  },
  Garmin: {
    'Basic':         { total: 5800,  items: ['GPSMAP 943xsv', 'GMR 18 HD+', 'VHF 215', 'GT54UHD Transducer'] },
    'Mid Range':     { total: 13900, items: ['GPSMAP 1243xsv', 'Fantom 24 Radar', 'GMI 20 Instrument', 'GHC 50 Autopilot'] },
    'Full Offshore': { total: 31200, items: ['Dual GPSMAP 8624', 'GMR Fantom 504', 'AIS 800', 'Reactor 40 Autopilot', 'Panoptix LiveScope'] },
    'Custom':        { total: 0,     items: [] },
  },
  Mixed: {
    'Basic':         { total: 6100,  items: ['Simrad NSS9 + Garmin Radar'] },
    'Mid Range':     { total: 14300, items: ['NSS12 Evo3S + Garmin Autopilot + JL Audio'] },
    'Full Offshore': { total: 31800, items: ['Dual MFD setup, mixed brands offshore package'] },
    'Custom':        { total: 0,     items: [] },
  },
};
let elBrand  = 'Simrad';
let elPreset = 'Basic';

function recalcElectronics() {
  const p = ELECTRONICS_PRESETS[elBrand][elPreset];
  $('#el-total').textContent = money(p.total);
  $('#el-result').innerHTML = `
    <div class="label">${escapeHtml(elBrand)} · ${escapeHtml(elPreset)} · Estimated total (parts only, excl. labor)</div>
    <div class="big">${money(p.total)}</div>
    ${p.items.length ? `<div class="breakdown" style="grid-template-columns:1fr;text-align:left;">
      ${p.items.map((i) => `<span>• ${escapeHtml(i)}</span>`).join('')}
    </div>` : `<div class="breakdown" style="grid-template-columns:1fr;text-align:center;color:#cfd6e3;">Custom build — set total manually below.</div>`}
  `;
}
$$('#el-brand .choice').forEach((b) => {
  b.addEventListener('click', () => {
    elBrand = b.dataset.v;
    $$('#el-brand .choice').forEach((c) => c.classList.toggle('active', c === b));
    recalcElectronics();
  });
});
$$('#el-preset .choice').forEach((b) => {
  b.addEventListener('click', () => {
    elPreset = b.dataset.v;
    $$('#el-preset .choice').forEach((c) => c.classList.toggle('active', c === b));
    recalcElectronics();
  });
});
$('#el-save').addEventListener('click', async () => {
  const customer = $('#el-customer').value.trim();
  const boat     = $('#el-boat').value.trim();
  if (!customer) { toast('Enter a customer name first', 'error'); return; }
  const p = ELECTRONICS_PRESETS[elBrand][elPreset];
  try {
    await api('POST', '/electronics_builds', {
      customer_name: customer, boat, brand: elBrand, preset: elPreset,
      total: p.total, items: JSON.stringify(p.items),
    });
    toast('Build saved');
  } catch (e) { toast(e.message, 'error'); }
});
recalcElectronics();
recalcPayment();
recalcAppraisal();

// ── Kick it off ────────────────────────────────────────────────────────
boot();
