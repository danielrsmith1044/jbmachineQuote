const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, nextQuoteReference } = require('../db');
const { loadQuote, calculateQuote } = require('../pricing');
const { generateQuotePdf } = require('../pdf');
const { ATTACHMENTS_DIR } = require('../paths');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const quoteDir = path.join(ATTACHMENTS_DIR, String(req.params.id));
      fs.mkdirSync(quoteDir, { recursive: true });
      cb(null, quoteDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const stamp = Date.now().toString(36);
      const rand = crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}-${rand}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

function attachmentsFor(quoteId) {
  return db
    .prepare(
      'SELECT id, filename, original_name, mime_type, size, uploaded_at FROM quote_attachments WHERE quote_id = ? ORDER BY uploaded_at DESC, id DESC'
    )
    .all(quoteId);
}

function replaceQuantities(quoteId, quantities) {
  db.prepare('DELETE FROM quote_quantities WHERE quote_id = ?').run(quoteId);
  if (!Array.isArray(quantities)) return;
  const stmt = db.prepare(
    'INSERT INTO quote_quantities (quote_id, quantity, sort_order) VALUES (?, ?, ?)'
  );
  quantities.forEach((q, i) => {
    const n = parseInt(q.quantity ?? q, 10);
    if (Number.isFinite(n) && n > 0) stmt.run(quoteId, n, i);
  });
}

function replaceMaterials(quoteId, materials) {
  db.prepare('DELETE FROM quote_materials WHERE quote_id = ?').run(quoteId);
  if (!Array.isArray(materials)) return;
  const getMat = db.prepare('SELECT name, unit_of_measure FROM materials WHERE id = ?');
  const ins = db.prepare(
    `INSERT INTO quote_materials
       (quote_id, material_id, material_name_snapshot, unit_of_measure_snapshot, quantity_needed_per_unit, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  materials.forEach((m, i) => {
    const materialId = m.material_id ? Number(m.material_id) : null;
    let nameSnap = m.material_name_snapshot || null;
    let unitSnap = m.unit_of_measure_snapshot || null;
    if (materialId) {
      const src = getMat.get(materialId);
      if (src) {
        nameSnap = src.name;
        unitSnap = src.unit_of_measure;
      }
    }
    ins.run(
      quoteId,
      materialId,
      nameSnap,
      unitSnap,
      Number(m.quantity_needed_per_unit || 0),
      i
    );
  });
}

function assembleResponse(quoteId) {
  const q = loadQuote(quoteId);
  if (!q) return null;
  q.converted_to_job = !!q.converted_to_job;
  const pricing = calculateQuote(q);
  const attachments = attachmentsFor(quoteId);
  return { ...q, pricing, attachments };
}

router.get('/', (req, res) => {
  const { q, status, from, to } = req.query;
  const clauses = [];
  const params = [];
  if (q) {
    clauses.push('(customer_name LIKE ? OR job_name LIKE ? OR drawing_number LIKE ? OR reference LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (from) {
    clauses.push('date >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('date <= ?');
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT id, reference, customer_name, job_name, drawing_number, date, status,
              converted_to_job, updated_at
       FROM quotes ${where}
       ORDER BY date DESC, id DESC`
    )
    .all(...params);
  // Attach a quick summary total (first tier total) so history table can show a value.
  const summary = rows.map((r) => {
    const full = assembleResponse(r.id);
    const firstTier = full?.pricing?.rows?.[0];
    return {
      ...r,
      converted_to_job: !!r.converted_to_job,
      summary_total: firstTier ? firstTier.total : 0,
      tier_count: full?.pricing?.rows?.length || 0
    };
  });
  res.json(summary);
});

router.get('/:id', (req, res) => {
  const data = assembleResponse(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Quote not found' });
  res.json(data);
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const reference = b.reference || nextQuoteReference();
  const info = db
    .prepare(
      `INSERT INTO quotes
        (reference, customer_name, job_name, drawing_number, date, status,
         labor_type, labor_hours, labor_rate, labor_flat, markup_percent, notes)
       VALUES (?, ?, ?, ?, COALESCE(?, date('now')), COALESCE(?, 'Draft'), ?, ?, ?, ?, ?, ?)`
    )
    .run(
      reference,
      b.customer_name || null,
      b.job_name || null,
      b.drawing_number || null,
      b.date || null,
      b.status || null,
      b.labor_type || 'hourly',
      Number(b.labor_hours || 0),
      Number(b.labor_rate || 0),
      Number(b.labor_flat || 0),
      Number(b.markup_percent || 0),
      b.notes || null
    );
  const id = info.lastInsertRowid;
  replaceQuantities(id, b.quantities);
  replaceMaterials(id, b.materials);
  res.status(201).json(assembleResponse(id));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM quotes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });
  const b = req.body || {};
  db.prepare(
    `UPDATE quotes SET
       customer_name = ?,
       job_name = ?,
       drawing_number = ?,
       date = COALESCE(?, date),
       status = COALESCE(?, status),
       labor_type = COALESCE(?, labor_type),
       labor_hours = COALESCE(?, labor_hours),
       labor_rate = COALESCE(?, labor_rate),
       labor_flat = COALESCE(?, labor_flat),
       markup_percent = COALESCE(?, markup_percent),
       notes = ?,
       converted_to_job = COALESCE(?, converted_to_job),
       job_notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.customer_name ?? null,
    b.job_name ?? null,
    b.drawing_number ?? null,
    b.date ?? null,
    b.status ?? null,
    b.labor_type ?? null,
    b.labor_hours == null ? null : Number(b.labor_hours),
    b.labor_rate == null ? null : Number(b.labor_rate),
    b.labor_flat == null ? null : Number(b.labor_flat),
    b.markup_percent == null ? null : Number(b.markup_percent),
    b.notes ?? null,
    b.converted_to_job == null ? null : b.converted_to_job ? 1 : 0,
    b.job_notes ?? null,
    id
  );
  if (Array.isArray(b.quantities)) replaceQuantities(id, b.quantities);
  if (Array.isArray(b.materials)) replaceMaterials(id, b.materials);
  res.json(assembleResponse(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
  const dir = path.join(ATTACHMENTS_DIR, String(id));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

// ---- Attachments ----
router.get('/:id/attachments', (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM quotes WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Quote not found' });
  res.json(attachmentsFor(id));
});

router.post('/:id/attachments', upload.array('files', 20), (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM quotes WHERE id = ?').get(id);
  if (!exists) {
    // clean up any files multer wrote
    (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Quote not found' });
  }
  const ins = db.prepare(
    'INSERT INTO quote_attachments (quote_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)'
  );
  const inserted = [];
  for (const f of req.files || []) {
    const info = ins.run(id, f.filename, f.originalname, f.mimetype, f.size);
    inserted.push(info.lastInsertRowid);
  }
  res.status(201).json(attachmentsFor(id));
});

router.get('/:id/attachments/:attId/download', (req, res) => {
  const id = Number(req.params.id);
  const attId = Number(req.params.attId);
  const row = db
    .prepare('SELECT filename, original_name, mime_type FROM quote_attachments WHERE id = ? AND quote_id = ?')
    .get(attId, id);
  if (!row) return res.status(404).json({ error: 'Attachment not found' });
  const filePath = path.join(ATTACHMENTS_DIR, String(id), row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
  const disposition = String(req.query.inline || '') === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${row.original_name.replace(/"/g, '')}"`
  );
  fs.createReadStream(filePath).pipe(res);
});

router.delete('/:id/attachments/:attId', (req, res) => {
  const id = Number(req.params.id);
  const attId = Number(req.params.attId);
  const row = db
    .prepare('SELECT filename FROM quote_attachments WHERE id = ? AND quote_id = ?')
    .get(attId, id);
  if (!row) return res.status(404).json({ error: 'Attachment not found' });
  db.prepare('DELETE FROM quote_attachments WHERE id = ?').run(attId);
  const filePath = path.join(ATTACHMENTS_DIR, String(id), row.filename);
  fs.unlink(filePath, () => {});
  res.json({ ok: true });
});

router.post('/:id/duplicate', (req, res) => {
  const srcId = Number(req.params.id);
  const src = loadQuote(srcId);
  if (!src) return res.status(404).json({ error: 'Quote not found' });
  const newRef = nextQuoteReference();
  const info = db
    .prepare(
      `INSERT INTO quotes
        (reference, customer_name, job_name, drawing_number, date, status,
         labor_type, labor_hours, labor_rate, labor_flat, markup_percent, notes)
       VALUES (?, ?, ?, ?, date('now'), 'Draft', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      newRef,
      src.customer_name,
      src.job_name,
      src.drawing_number,
      src.labor_type,
      src.labor_hours,
      src.labor_rate,
      src.labor_flat,
      src.markup_percent,
      src.notes
    );
  const newId = info.lastInsertRowid;
  replaceQuantities(newId, src.quantities.map((q) => ({ quantity: q.quantity })));
  replaceMaterials(
    newId,
    src.materials.map((m) => ({
      material_id: m.material_id,
      material_name_snapshot: m.material_name_snapshot,
      unit_of_measure_snapshot: m.unit_of_measure_snapshot,
      quantity_needed_per_unit: m.quantity_needed_per_unit
    }))
  );
  res.status(201).json(assembleResponse(newId));
});

router.get('/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  const data = assembleResponse(id);
  if (!data) return res.status(404).json({ error: 'Quote not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="quote-${data.reference || id}.pdf"`
  );
  generateQuotePdf(data, res);
});

module.exports = router;
