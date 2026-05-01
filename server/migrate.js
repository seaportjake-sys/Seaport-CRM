// Schema migration. Idempotent — safe to run on every boot.
//
// For each entity in entities.js we:
//   1. CREATE TABLE IF NOT EXISTS with id / created_at / updated_at
//   2. ADD COLUMN IF NOT EXISTS for each declared field (so adding a new
//      field to entities.js automatically rolls forward without a manual
//      migration step).
//
// We never drop columns automatically — if you remove a field from
// entities.js the column stays in the database (data preserved). Drop it
// manually if you really want to.

const { query } = require('./db');
const { entities, pgType } = require('./entities');

async function ensureTable(name, def) {
  await query(`
    CREATE TABLE IF NOT EXISTS "${name}" (
      id          SERIAL PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const field of def.fields) {
    await query(
      `ALTER TABLE "${name}" ADD COLUMN IF NOT EXISTS "${field.name}" ${pgType(field)}`
    );
  }
}

async function migrate() {
  for (const [name, def] of Object.entries(entities)) {
    await ensureTable(name, def);
    console.log(`[migrate] ✓ ${name}`);
  }
}

if (require.main === module) {
  migrate()
    .then(() => { console.log('[migrate] done'); process.exit(0); })
    .catch((err) => { console.error('[migrate] FAILED:', err); process.exit(1); });
}

module.exports = { migrate };
