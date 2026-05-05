// Generic CRUD route factory. One copy of the logic for every entity.
//
// Routes mounted at /api/:entity:
//   GET    /api/:entity                    → list (optional ?field=value filters)
//   GET    /api/:entity/:id                → fetch one
//   POST   /api/:entity                    → create
//   PUT    /api/:entity/:id                → update
//   DELETE /api/:entity/:id                → delete
//
// The "users" entity is intentionally NOT exposed here — auth-sensitive.
// A read-only /api/users endpoint is mounted separately by server/index.js.

const express = require('express');
const { query } = require('./db');
const { entities } = require('./entities');

const PROTECTED_ENTITIES = new Set(['users']);

// Some entities want a custom default sort.
const SORT_BY = {
  lead_activities: 'occurred_at DESC NULLS LAST, id DESC',
};

function pickAllowedFields(entityDef, body) {
  const out = {};
  for (const field of entityDef.fields) {
    if (Object.prototype.hasOwnProperty.call(body, field.name)) {
      let v = body[field.name];
      if (v === '' || v === undefined) v = null;
      if (field.type === 'number' && v !== null) v = Number(v);
      if (field.type === 'foreign' && v !== null) v = Number(v) || null;
      out[field.name] = v;
    }
  }
  return out;
}

function buildRouter() {
  const router = express.Router();

  router.get('/_schema', (_req, res) => res.json(entities));

  router.param('entity', (req, res, next, name) => {
    const def = entities[name];
    if (!def) return res.status(404).json({ error: `Unknown entity: ${name}` });
    if (PROTECTED_ENTITIES.has(name)) return res.status(403).json({ error: 'Use the dedicated endpoint for this entity' });
    req.entityName = name;
    req.entityDef  = def;
    next();
  });

  // LIST  (with optional ?field=value filters, AND-combined)
  router.get('/:entity', async (req, res, next) => {
    try {
      const where = [];
      const params = [];
      for (const [k, v] of Object.entries(req.query)) {
        const f = req.entityDef.fields.find((f) => f.name === k);
        if (!f) continue;
        params.push(v);
        where.push(`"${k}" = $${params.length}`);
      }
      const sort = SORT_BY[req.entityName] || 'id DESC';
      const sql  = `SELECT * FROM "${req.entityName}"
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY ${sort} LIMIT 1000`;
      const { rows } = await query(sql, params);
      res.json(rows);
    } catch (e) { next(e); }
  });

  router.get('/:entity/:id', async (req, res, next) => {
    try {
      const { rows } = await query(`SELECT * FROM "${req.entityName}" WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  router.post('/:entity', async (req, res, next) => {
    try {
      const data = pickAllowedFields(req.entityDef, req.body || {});
      const cols = Object.keys(data);
      if (!cols.length) return res.status(400).json({ error: 'No valid fields supplied' });
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const colList      = cols.map((c) => `"${c}"`).join(', ');
      const values       = cols.map((c) => data[c]);
      const { rows } = await query(
        `INSERT INTO "${req.entityName}" (${colList}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  router.put('/:entity/:id', async (req, res, next) => {
    try {
      const data = pickAllowedFields(req.entityDef, req.body || {});
      const cols = Object.keys(data);
      if (!cols.length) return res.status(400).json({ error: 'No valid fields supplied' });
      const setSql = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      const values = cols.map((c) => data[c]);
      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE "${req.entityName}" SET ${setSql}, updated_at = now()
          WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  router.delete('/:entity/:id', async (req, res, next) => {
    try {
      const { rowCount } = await query(`DELETE FROM "${req.entityName}" WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { buildRouter };
