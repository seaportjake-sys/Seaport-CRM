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
//
// Then we seed the three salesperson accounts. They have no password yet
// — each one is set the first time that user logs in.

const { query } = require('./db');
const { entities, pgType } = require('./entities');

const SEED_USERS = [
  { email: 'seaportjake@gmail.com',   name: 'Jake'   },
  { email: 'seaportboats@gmail.com',  name: 'Theo'   },
  { email: 'rob.seaport@gmail.com',   name: 'Robert' },
];

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

async function ensureUniqueEmailIndex() {
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
      ON "users" (LOWER(email))
  `);
}

async function seedUsers() {
  for (const u of SEED_USERS) {
    await query(
      `INSERT INTO "users" (email, name)
            VALUES ($1, $2)
       ON CONFLICT ON CONSTRAINT users_email_lower_unique DO NOTHING`,
      [u.email, u.name]
    ).catch(async () => {
      // Fallback if ON CONFLICT constraint name differs across versions: do it the slow way.
      const { rows } = await query('SELECT id FROM "users" WHERE LOWER(email) = LOWER($1)', [u.email]);
      if (!rows.length) {
        await query('INSERT INTO "users" (email, name) VALUES ($1, $2)', [u.email, u.name]);
      }
    });
  }
}

async function migrate() {
  for (const [name, def] of Object.entries(entities)) {
    await ensureTable(name, def);
    console.log(`[migrate] ✓ ${name}`);
  }
  await ensureUniqueEmailIndex();
  await seedUsers();
  console.log('[migrate] ✓ seeded users');
}

if (require.main === module) {
  migrate()
    .then(() => { console.log('[migrate] done'); process.exit(0); })
    .catch((err) => { console.error('[migrate] FAILED:', err); process.exit(1); });
}

module.exports = { migrate, SEED_USERS };
