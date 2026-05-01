// Generic CRUD route factory. One copy of the logic for every entity.
//
// Routes mounted at /api/:entity:
//   GET    /api/:entity          → list (newest first)
//   GET    /api/:entity/:id      → fetch one
//   POST   /api/:entity          → create
//   PUT    /api/:entity/:id      → update
//   DELETE /api/:entity/:id      → delete
//
// Validates field names against entities.js so callers can't write to
// arbitrary columns.

const express = require('express');
const { query } = require('./db');
const { entities } = require('./entities');

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

  // Schema endpoint — frontend reads this once on load to render itself.
  router.get('/_schema', (_req, res) => {
    res.json(entities);
  });

  router.param('entity', (req, res, next, name) => {
    const def = entities[name];
    if (!def) return res.status(404).json({ error: `Unknown entity: ${name}` });
    req.entityName = name;
    req.entityDef  = def;
    next();
  });

  // LIST
  router.get('/:entity', async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT * FROM "${req.entityName}" ORDER BY id DESC LIMIT 1000`
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET ONE
  router.get('/:entity/:id', async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT * FROM "${req.entityName}" WHERE id = $1`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  // CREATE
  router.post('/:entity', async (req, res, next) => {
    try {
      const data = pickAllowedFields(req.entityDef, req.body || {});
      const cols = Object.keys(data);
      if (cols.length === 0) {
        return res.status(400).json({ error: 'No valid fields supplied' });
      }
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

  // UPDATE
  router.put('/:entity/:id', async (req, res, next) => {
    try {
      const data = pickAllowedFields(req.entityDef, req.body || {});
      const cols = Object.keys(data);
      if (cols.length === 0) {
        return res.status(400).json({ error: 'No valid fields supplied' });
      }
      const setSql = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      const values = cols.map((c) => data[c]);
      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE "${req.entityName}"
            SET ${setSql}, updated_at = now()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  // DELETE
  router.delete('/:entity/:id', async (req, res, next) => {
    try {
      const { rowCount } = await query(
        `DELETE FROM "${req.entityName}" WHERE id = $1`,
        [req.params.id]
      );
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { buildRouter };
