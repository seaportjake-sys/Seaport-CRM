const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error(
    '\n[seaport-crm] FATAL: DATABASE_URL is not set.\n' +
    '  • On Render, the render.yaml Blueprint wires this automatically — make sure\n' +
    '    you deployed via Blueprint, not as a plain Web Service.\n' +
    '  • Locally, copy .env.example to .env and point it at a Postgres instance.\n'
  );
  process.exit(1);
}

// Render Postgres requires SSL. Local Postgres usually doesn't.
const useSsl = /render\.com|amazonaws\.com|sslmode=require/.test(process.env.DATABASE_URL)
            || process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 5,
});

pool.on('error', (err) => {
  console.error('[seaport-crm] Unexpected pg pool error:', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
