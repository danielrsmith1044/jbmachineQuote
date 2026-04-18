const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');

const router = express.Router();

function coerceBool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 't', 'in stock', 'stock'].includes(s);
}

function insertMaterialWithTiers(m) {
  const info = db
    .prepare(
      `INSERT INTO materials (name, unit_of_measure, supplier, base_price, in_stock, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      m.name,
      m.unit_of_measure,
      m.supplier || null,
      Number(m.base_price || 0),
      coerceBool(m.in_stock) ? 1 : 0,
      m.notes || null
    );
  const id = info.lastInsertRowid;
  if (Array.isArray(m.pricing_tiers) && m.pricing_tiers.length) {
    const tierStmt = db.prepare(
      'INSERT INTO material_pricing_tiers (material_id, min_quantity, max_quantity, price_per_unit) VALUES (?, ?, ?, ?)'
    );
    for (const t of m.pricing_tiers) {
      const min = Number(t.min_quantity);
      if (!Number.isFinite(min)) continue;
      const max = t.max_quantity === '' || t.max_quantity == null ? null : Number(t.max_quantity);
      const price = Number(t.price_per_unit);
      if (!Number.isFinite(price)) continue;
      tierStmt.run(id, min, max, price);
    }
  }
  return id;
}

function getMaterial(id) {
  const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  if (!m) return null;
  m.in_stock = !!m.in_stock;
  m.pricing_tiers = db
    .prepare('SELECT id, min_quantity, max_quantity, price_per_unit FROM material_pricing_tiers WHERE material_id = ? ORDER BY min_quantity ASC')
    .all(id);
  return m;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY name COLLATE NOCASE').all();
  const tiers = db.prepare('SELECT * FROM material_pricing_tiers ORDER BY min_quantity ASC').all();
  const tiersByMat = new Map();
  for (const t of tiers) {
    if (!tiersByMat.has(t.material_id)) tiersByMat.set(t.material_id, []);
    tiersByMat.get(t.material_id).push({
      id: t.id,
      min_quantity: t.min_quantity,
      max_quantity: t.max_quantity,
      price_per_unit: t.price_per_unit
    });
  }
  res.json(
    rows.map((m) => ({
      ...m,
      in_stock: !!m.in_stock,
      pricing_tiers: tiersByMat.get(m.id) || []
    }))
  );
});

router.get('/catalog/starter', (req, res) => {
  const p = path.join(__dirname, '..', 'starter-catalog.json');
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Could not load starter catalog' });
  }
});

router.get('/:id', (req, res) => {
  const m = getMaterial(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Material not found' });
  res.json(m);
});

function upsertTiers(materialId, tiers) {
  db.prepare('DELETE FROM material_pricing_tiers WHERE material_id = ?').run(materialId);
  if (!Array.isArray(tiers)) return;
  const stmt = db.prepare(
    'INSERT INTO material_pricing_tiers (material_id, min_quantity, max_quantity, price_per_unit) VALUES (?, ?, ?, ?)'
  );
  for (const t of tiers) {
    const min = Number(t.min_quantity);
    if (!Number.isFinite(min)) continue;
    const max = t.max_quantity === '' || t.max_quantity == null ? null : Number(t.max_quantity);
    const price = Number(t.price_per_unit);
    if (!Number.isFinite(price)) continue;
    stmt.run(materialId, min, max, price);
  }
}

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.unit_of_measure) {
    return res.status(400).json({ error: 'name and unit_of_measure are required' });
  }
  const info = db
    .prepare(
      `INSERT INTO materials (name, unit_of_measure, supplier, base_price, in_stock, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.name,
      b.unit_of_measure,
      b.supplier || null,
      Number(b.base_price || 0),
      b.in_stock ? 1 : 0,
      b.notes || null
    );
  upsertTiers(info.lastInsertRowid, b.pricing_tiers);
  res.status(201).json(getMaterial(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM materials WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Material not found' });
  const b = req.body || {};
  db.prepare(
    `UPDATE materials SET
       name = COALESCE(?, name),
       unit_of_measure = COALESCE(?, unit_of_measure),
       supplier = ?,
       base_price = COALESCE(?, base_price),
       in_stock = COALESCE(?, in_stock),
       notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.name ?? null,
    b.unit_of_measure ?? null,
    b.supplier ?? null,
    b.base_price == null ? null : Number(b.base_price),
    b.in_stock == null ? null : b.in_stock ? 1 : 0,
    b.notes ?? null,
    id
  );
  if (Array.isArray(b.pricing_tiers)) upsertTiers(id, b.pricing_tiers);
  res.json(getMaterial(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM materials WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Starter catalog seed ----
router.post('/seed', (req, res) => {
  const p = path.join(__dirname, '..', 'starter-catalog.json');
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Could not load starter catalog' });
  }
  const existing = new Set(
    db.prepare('SELECT LOWER(name) AS n FROM materials').all().map((r) => r.n)
  );
  const inserted = [];
  const skipped = [];
  const tx = db.transaction((items) => {
    for (const m of items) {
      if (!m.name || !m.unit_of_measure) {
        skipped.push({ name: m.name || '(missing name)', reason: 'missing fields' });
        continue;
      }
      if (existing.has(m.name.toLowerCase())) {
        skipped.push({ name: m.name, reason: 'already exists' });
        continue;
      }
      insertMaterialWithTiers(m);
      existing.add(m.name.toLowerCase());
      inserted.push(m.name);
    }
  });
  tx(catalog.materials || []);
  res.json({ inserted: inserted.length, skipped: skipped.length, skipped_items: skipped });
});

// ---- Bulk import (from CSV/paste) ----
router.post('/bulk-import', (req, res) => {
  const rows = Array.isArray(req.body?.materials) ? req.body.materials : [];
  const overwrite = !!req.body?.overwrite;
  const existing = new Map(
    db
      .prepare('SELECT id, LOWER(name) AS n FROM materials')
      .all()
      .map((r) => [r.n, r.id])
  );
  const inserted = [];
  const updated = [];
  const skipped = [];
  const errors = [];
  const tx = db.transaction((items) => {
    items.forEach((m, i) => {
      const rowNum = i + 1;
      if (!m.name || !m.unit_of_measure) {
        errors.push({ row: rowNum, reason: 'name and unit_of_measure are required' });
        return;
      }
      const key = m.name.toLowerCase();
      if (existing.has(key)) {
        if (overwrite) {
          const id = existing.get(key);
          db.prepare(
            `UPDATE materials SET
               unit_of_measure = ?, supplier = ?, base_price = ?,
               in_stock = ?, notes = ?, updated_at = datetime('now')
             WHERE id = ?`
          ).run(
            m.unit_of_measure,
            m.supplier || null,
            Number(m.base_price || 0),
            coerceBool(m.in_stock) ? 1 : 0,
            m.notes || null,
            id
          );
          updated.push(m.name);
        } else {
          skipped.push({ row: rowNum, name: m.name, reason: 'already exists' });
        }
        return;
      }
      insertMaterialWithTiers(m);
      existing.set(key, true);
      inserted.push(m.name);
    });
  });
  tx(rows);
  res.json({
    inserted: inserted.length,
    updated: updated.length,
    skipped: skipped.length,
    errors,
    skipped_items: skipped
  });
});

module.exports = router;
