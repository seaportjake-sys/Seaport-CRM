// ─────────────────────────────────────────────────────────────────────────────
// ENTITY DEFINITIONS — the single source of truth.
//
// Add a new feature (a new kind of record — contacts, tasks, accounts, etc.)
// by adding one entry below. The server auto-creates the table + REST API,
// and the frontend auto-renders a page, table, and form for it.
//
// Field types supported by the UI: text, textarea, email, tel, number, date,
// select, foreign (links to another entity by id).
//
// `listColumns` controls which fields show in the table view (defaults to all).
// `titleField`  controls how rows are labelled in dropdowns / titles.
// ─────────────────────────────────────────────────────────────────────────────

const entities = {
  leads: {
    label: 'Leads',
    icon: '👤',
    titleField: 'name',
    listColumns: ['name', 'company', 'email', 'status'],
    fields: [
      { name: 'name',    label: 'Name',    type: 'text',     required: true },
      { name: 'email',   label: 'Email',   type: 'email' },
      { name: 'phone',   label: 'Phone',   type: 'tel' },
      { name: 'company', label: 'Company', type: 'text' },
      {
        name: 'status', label: 'Status', type: 'select',
        options: ['New', 'Contacted', 'Qualified', 'Unqualified', 'Lost'],
        default: 'New',
      },
      { name: 'source',  label: 'Source',  type: 'text' },
      { name: 'notes',   label: 'Notes',   type: 'textarea' },
    ],
  },

  deals: {
    label: 'Deals',
    icon: '💼',
    titleField: 'title',
    listColumns: ['title', 'value', 'stage', 'lead_id', 'close_date'],
    fields: [
      { name: 'title',      label: 'Title',          type: 'text',   required: true },
      { name: 'value',      label: 'Value ($)',      type: 'number' },
      {
        name: 'stage', label: 'Stage', type: 'select',
        options: ['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'],
        default: 'Prospect',
      },
      { name: 'lead_id',    label: 'Lead',           type: 'foreign', references: 'leads' },
      { name: 'close_date', label: 'Expected close', type: 'date' },
      { name: 'notes',      label: 'Notes',          type: 'textarea' },
    ],
  },

  // ── EXAMPLE: uncomment to add a "tasks" feature ────────────────────────────
  // tasks: {
  //   label: 'Tasks',
  //   icon: '✅',
  //   titleField: 'title',
  //   listColumns: ['title', 'due_date', 'done', 'lead_id'],
  //   fields: [
  //     { name: 'title',    label: 'Title',    type: 'text', required: true },
  //     { name: 'due_date', label: 'Due',      type: 'date' },
  //     { name: 'done',     label: 'Done',     type: 'select', options: ['No', 'Yes'], default: 'No' },
  //     { name: 'lead_id',  label: 'Lead',     type: 'foreign', references: 'leads' },
  //     { name: 'notes',    label: 'Notes',    type: 'textarea' },
  //   ],
  // },
};

// Map UI field types to Postgres column types.
const PG_TYPES = {
  text:     'TEXT',
  textarea: 'TEXT',
  email:    'TEXT',
  tel:      'TEXT',
  number:   'NUMERIC',
  date:     'DATE',
  select:   'TEXT',
  foreign:  'INTEGER',
};

function pgType(field) {
  return PG_TYPES[field.type] || 'TEXT';
}

module.exports = { entities, pgType };
