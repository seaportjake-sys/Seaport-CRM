// ─────────────────────────────────────────────────────────────────────────────
// ENTITY DEFINITIONS — single source of truth for what persists in Postgres.
//
// Adding/removing a field here is automatically picked up on next deploy:
//   - migrate.js runs `ADD COLUMN IF NOT EXISTS` on every boot
//   - crud.js exposes /api/{entity} for any entity here
//
// The frontend has hand-built views per tab, so adding a new entity here
// won't auto-generate UI — but the API will be live for whatever you build.
// ─────────────────────────────────────────────────────────────────────────────

const entities = {
  leads: {
    label: 'Leads',
    fields: [
      { name: 'name',              type: 'text' },
      { name: 'phone',             type: 'text' },
      { name: 'email',             type: 'text' },
      { name: 'budget',            type: 'number' },
      { name: 'boat_interest',     type: 'text' },
      { name: 'trade_in',          type: 'text' },
      { name: 'salesperson',       type: 'text' },
      { name: 'status',            type: 'text' },   // Hot / Warm / Cold
      { name: 'first_contact_date',type: 'date' },
      { name: 'last_contact_date', type: 'date' },
      { name: 'contact_type',      type: 'text' },   // Call / Text / Email / In Person
      { name: 'follow_up_date',    type: 'date' },
      { name: 'notes',             type: 'textarea' },
    ],
  },

  boats: {
    label: 'Boats',
    fields: [
      { name: 'year',          type: 'number' },
      { name: 'make',          type: 'text' },
      { name: 'model',         type: 'text' },
      { name: 'stock_number',  type: 'text' },
      { name: 'price',         type: 'number' },
      { name: 'cost',          type: 'number' },
      { name: 'status',        type: 'text' },   // In Stock / Sold / On Order
      { name: 'location',      type: 'text' },
      { name: 'notes',         type: 'textarea' },
    ],
  },

  deals: {
    label: 'Deals',
    fields: [
      { name: 'customer_name',   type: 'text' },
      { name: 'lead_id',         type: 'foreign', references: 'leads' },
      { name: 'boat',            type: 'text' },
      { name: 'salesperson',     type: 'text' },
      { name: 'sale_date',       type: 'date' },

      { name: 'selling_price',   type: 'number' },
      { name: 'doc_fees',        type: 'number' },
      { name: 'finance_reserve', type: 'number' },
      { name: 'trade_recouped',  type: 'number' },

      { name: 'invoice_cost',    type: 'number' },
      { name: 'trade_allowance', type: 'number' },
      { name: 'rigging_prep',    type: 'number' },
      { name: 'other_costs',     type: 'number' },

      { name: 'status',          type: 'text' },   // Active / Sold / Lost
      { name: 'notes',           type: 'textarea' },
    ],
  },

  electronics_builds: {
    label: 'Electronics Builds',
    fields: [
      { name: 'customer_name', type: 'text' },
      { name: 'boat',          type: 'text' },
      { name: 'brand',         type: 'text' },   // Simrad / Garmin / Mixed
      { name: 'preset',        type: 'text' },   // Basic / Mid Range / Full Offshore / Custom
      { name: 'total',         type: 'number' },
      { name: 'items',         type: 'textarea' }, // JSON string of line items
      { name: 'notes',         type: 'textarea' },
    ],
  },
};

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
