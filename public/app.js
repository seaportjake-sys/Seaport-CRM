// Seaport CRM frontend.
//
// The whole UI is driven by /api/_schema. Add an entity in server/entities.js
// and a sidebar item, table view, and create/edit form appear automatically.
//
// No frameworks, no build step — this file is plain ES2020 in the browser.

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  schema:        {},   // entity name → { label, fields, ... }
  currentEntity: null, // string
  records:       [],   // current entity's rows
  cache:         {},   // entity name → rows (used to label foreign keys)
};

// ── API helper ────────────────────────────────────────────────────────────
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
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, 2400);
}

// ── Auth ──────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const { authRequired, authed } = await fetch('/api/_authcheck').then((r) => r.json());
    if (authRequired && !authed) { showLogin(); return false; }
    hideLogin();
    return true;
  } catch (e) {
    toast('Could not reach the server.', 'error');
    return false;
  }
}

function showLogin() {
  $('#login-overlay').hidden = false;
  setTimeout(() => $('#login-password').focus(), 50);
}
function hideLogin() { $('#login-overlay').hidden = true; }

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  const password = $('#login-password').value;
  try {
    await api('POST', '/_login', { password });
    hideLogin();
    boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});

$('#logout-btn').addEventListener('click', () => {
  document.cookie = 'seaport_auth=; Path=/; Max-Age=0';
  location.reload();
});

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  if (!await checkAuth()) return;

  state.schema = await api('GET', '/_schema');
  if ((await fetch('/api/_authcheck').then((r) => r.json())).authRequired) {
    $('#logout-btn').hidden = false;
  }
  renderNav();

  // Restore last entity from URL hash, or default to first.
  const hashEntity = location.hash.replace(/^#\//, '');
  const initial = state.schema[hashEntity] ? hashEntity : Object.keys(state.schema)[0];
  if (initial) selectEntity(initial);
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  for (const [name, def] of Object.entries(state.schema)) {
    const a = document.createElement('a');
    a.className = 'nav-item';
    a.dataset.entity = name;
    a.href = `#/${name}`;
    a.innerHTML = `<span>${def.icon || '•'}</span><span>${escapeHtml(def.label || name)}</span>`;
    a.addEventListener('click', (e) => { e.preventDefault(); selectEntity(name); });
    nav.appendChild(a);
  }
}

async function selectEntity(name) {
  state.currentEntity = name;
  history.replaceState(null, '', `#/${name}`);
  $$('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.entity === name);
  });
  const def = state.schema[name];
  $('#page-title').textContent = def.label || name;
  $('#new-btn').hidden = false;
  await loadRecords();
  renderTable();
}

// ── Records ───────────────────────────────────────────────────────────────
async function loadRecords() {
  state.records = await api('GET', `/${state.currentEntity}`);
  state.cache[state.currentEntity] = state.records;

  // Pre-load any referenced entities so foreign key columns can show titles.
  const def = state.schema[state.currentEntity];
  const referenced = new Set(def.fields.filter((f) => f.type === 'foreign').map((f) => f.references));
  await Promise.all(
    Array.from(referenced).map(async (ref) => {
      if (!state.cache[ref]) state.cache[ref] = await api('GET', `/${ref}`);
    })
  );
}

function renderTable() {
  const def     = state.schema[state.currentEntity];
  const cols    = def.listColumns && def.listColumns.length
    ? def.listColumns
    : def.fields.map((f) => f.name);
  const fieldByName = Object.fromEntries(def.fields.map((f) => [f.name, f]));

  const content = $('#content');
  if (!state.records.length) {
    content.innerHTML = `
      <table class="records">
        <thead><tr>${cols.map((c) => `<th>${escapeHtml(fieldByName[c]?.label || c)}</th>`).join('')}</tr></thead>
        <tbody><tr><td class="empty" colspan="${cols.length}">No ${escapeHtml(def.label.toLowerCase())} yet. Click <strong>+ New</strong> to add one.</td></tr></tbody>
      </table>`;
    return;
  }

  const rows = state.records.map((row) => {
    const cells = cols.map((c) => {
      const f = fieldByName[c];
      return `<td>${formatCell(row[c], f)}</td>`;
    }).join('');
    return `<tr class="row" data-id="${row.id}">${cells}</tr>`;
  }).join('');

  content.innerHTML = `
    <table class="records">
      <thead><tr>${cols.map((c) => `<th>${escapeHtml(fieldByName[c]?.label || c)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  $$('.row').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = Number(tr.dataset.id);
      const rec = state.records.find((r) => r.id === id);
      openForm(rec);
    });
  });
}

function formatCell(value, field) {
  if (value === null || value === undefined || value === '') return '<span class="muted">—</span>';
  if (!field) return escapeHtml(String(value));
  if (field.type === 'select') {
    const cls = badgeClassFor(value);
    return `<span class="badge ${cls}">${escapeHtml(String(value))}</span>`;
  }
  if (field.type === 'foreign') {
    const refRows = state.cache[field.references] || [];
    const refDef  = state.schema[field.references];
    const refRow  = refRows.find((r) => r.id === Number(value));
    if (!refRow) return `<span class="muted">#${value}</span>`;
    const title = refRow[refDef.titleField || 'name'] || `#${refRow.id}`;
    return escapeHtml(String(title));
  }
  if (field.type === 'date' && value) {
    return escapeHtml(String(value).slice(0, 10));
  }
  if (field.type === 'number' && field.name === 'value') {
    const n = Number(value);
    return Number.isFinite(n) ? '$' + n.toLocaleString() : escapeHtml(String(value));
  }
  return escapeHtml(String(value));
}

function badgeClassFor(value) {
  const v = String(value).toLowerCase();
  if (['won', 'qualified', 'yes', 'done'].some((k) => v.includes(k))) return 'green';
  if (['lost', 'unqualified', 'no'].some((k) => v.includes(k)))       return 'red';
  if (['proposal', 'negotiation', 'contacted'].some((k) => v.includes(k))) return 'amber';
  if (['new', 'prospect'].some((k) => v.includes(k)))                 return 'blue';
  return 'gray';
}

// ── Form (create / edit) ──────────────────────────────────────────────────
function openForm(record) {
  const def     = state.schema[state.currentEntity];
  const editing = Boolean(record && record.id);
  const data    = record || {};

  const form = $('#record-form');
  form.innerHTML = `
    <h2>${editing ? 'Edit' : 'New'} ${escapeHtml(def.label.replace(/s$/, ''))}</h2>
    ${def.fields.map((f) => fieldInput(f, data[f.name])).join('')}
    <div class="row">
      ${editing ? `<button type="button" class="danger" id="delete-btn">Delete</button>` : '<span></span>'}
      <div class="row">
        <button type="button" class="secondary" id="cancel-btn">Cancel</button>
        <button class="primary" type="submit">${editing ? 'Save' : 'Create'}</button>
      </div>
    </div>`;

  $('#modal-overlay').hidden = false;

  $('#cancel-btn').addEventListener('click', closeForm);

  if (editing) {
    $('#delete-btn').addEventListener('click', async () => {
      if (!confirm(`Delete this ${def.label.replace(/s$/, '').toLowerCase()}?`)) return;
      try {
        await api('DELETE', `/${state.currentEntity}/${record.id}`);
        closeForm();
        await loadRecords();
        renderTable();
        toast('Deleted');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of def.fields) {
      const el = form.elements.namedItem(f.name);
      if (!el) continue;
      payload[f.name] = el.value;
    }
    try {
      if (editing) {
        await api('PUT', `/${state.currentEntity}/${record.id}`, payload);
        toast('Saved');
      } else {
        await api('POST', `/${state.currentEntity}`, payload);
        toast('Created');
      }
      closeForm();
      await loadRecords();
      renderTable();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

function closeForm() {
  $('#modal-overlay').hidden = true;
  $('#record-form').onsubmit = null;
}

function fieldInput(field, value) {
  const v = value == null ? (field.default ?? '') : value;
  const id = `f-${field.name}`;
  const required = field.required ? 'required' : '';
  let inputHtml = '';

  if (field.type === 'textarea') {
    inputHtml = `<textarea id="${id}" name="${field.name}" ${required}>${escapeHtml(v)}</textarea>`;
  } else if (field.type === 'select') {
    const opts = (field.options || []).map((o) =>
      `<option value="${escapeHtml(o)}" ${String(v) === String(o) ? 'selected' : ''}>${escapeHtml(o)}</option>`
    ).join('');
    inputHtml = `<select id="${id}" name="${field.name}" ${required}>${opts}</select>`;
  } else if (field.type === 'foreign') {
    const refRows = state.cache[field.references] || [];
    const refDef  = state.schema[field.references];
    const opts    = refRows.map((r) => {
      const title = r[refDef.titleField || 'name'] || `#${r.id}`;
      return `<option value="${r.id}" ${String(v) === String(r.id) ? 'selected' : ''}>${escapeHtml(String(title))}</option>`;
    }).join('');
    inputHtml = `
      <select id="${id}" name="${field.name}" ${required}>
        <option value="">— None —</option>
        ${opts}
      </select>`;
  } else {
    const t = field.type === 'tel' ? 'tel'
            : field.type === 'email' ? 'email'
            : field.type === 'number' ? 'number'
            : field.type === 'date' ? 'date'
            : 'text';
    const valAttr = field.type === 'date' && v ? String(v).slice(0, 10) : v;
    inputHtml = `<input type="${t}" id="${id}" name="${field.name}" value="${escapeHtml(valAttr)}" ${required} />`;
  }

  return `<label for="${id}">${escapeHtml(field.label)}${field.required ? ' *' : ''}${inputHtml}</label>`;
}

// Click outside the form card closes the modal.
$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeForm();
});

$('#new-btn').addEventListener('click', () => openForm(null));

// ── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

boot();
