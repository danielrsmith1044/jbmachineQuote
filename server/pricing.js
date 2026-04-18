const { db } = require('./db');

function materialUnitPrice(material, totalMaterialQty) {
  const tiers = db
    .prepare('SELECT min_quantity, max_quantity, price_per_unit FROM material_pricing_tiers WHERE material_id = ? ORDER BY min_quantity ASC')
    .all(material.id);
  for (const t of tiers) {
    const inRange =
      totalMaterialQty >= t.min_quantity &&
      (t.max_quantity == null || totalMaterialQty <= t.max_quantity);
    if (inRange) return t.price_per_unit;
  }
  return material.base_price;
}

function loadQuote(id) {
  const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
  if (!q) return null;
  q.quantities = db
    .prepare('SELECT id, quantity, sort_order FROM quote_quantities WHERE quote_id = ? ORDER BY sort_order, quantity')
    .all(id);
  q.materials = db
    .prepare(`
      SELECT qm.id, qm.material_id, qm.material_name_snapshot, qm.unit_of_measure_snapshot,
             qm.quantity_needed_per_unit, qm.sort_order,
             m.name AS current_name, m.unit_of_measure AS current_unit,
             m.base_price AS base_price, m.in_stock AS in_stock
      FROM quote_materials qm
      LEFT JOIN materials m ON m.id = qm.material_id
      WHERE qm.quote_id = ?
      ORDER BY qm.sort_order, qm.id
    `)
    .all(id);
  return q;
}

function calculateQuote(quote) {
  const { quantities = [], materials = [] } = quote;
  const setupMinutes = Number(quote.setup_minutes || 0);
  const perPieceMinutes = Number(quote.per_piece_minutes || 0);
  const laborRate = Number(quote.labor_rate || 0);
  const markup = Number(quote.markup_percent || 0) / 100;

  const rows = quantities.map((q) => {
    const qty = Number(q.quantity || 0);
    const laborTotal = ((setupMinutes + perPieceMinutes * qty) / 60) * laborRate;
    const materialLines = materials.map((m) => {
      const perUnitNeeded = Number(m.quantity_needed_per_unit || 0);
      const totalMatQty = perUnitNeeded * qty;
      let unitPrice = 0;
      if (m.material_id) {
        const mat = db.prepare('SELECT id, base_price FROM materials WHERE id = ?').get(m.material_id);
        if (mat) unitPrice = materialUnitPrice(mat, totalMatQty);
      }
      const lineTotal = unitPrice * totalMatQty;
      return {
        quote_material_id: m.id,
        material_id: m.material_id,
        name: m.current_name || m.material_name_snapshot,
        unit_of_measure: m.current_unit || m.unit_of_measure_snapshot,
        quantity_needed_per_unit: perUnitNeeded,
        total_material_quantity: totalMatQty,
        unit_price: unitPrice,
        line_total: lineTotal
      };
    });
    const materialTotal = materialLines.reduce((s, l) => s + l.line_total, 0);
    const subtotal = materialTotal + laborTotal;
    const markupAmount = subtotal * markup;
    const total = subtotal + markupAmount;
    const perUnit = qty > 0 ? total / qty : 0;
    const matPerUnit = qty > 0 ? materialTotal / qty : 0;
    const laborPerUnit = qty > 0 ? laborTotal / qty : 0;
    return {
      quantity: qty,
      material_total: materialTotal,
      material_per_unit: matPerUnit,
      labor_total: laborTotal,
      labor_per_unit: laborPerUnit,
      subtotal,
      markup_amount: markupAmount,
      total,
      per_unit: perUnit,
      materials: materialLines
    };
  });

  return { markup_percent: quote.markup_percent || 0, rows };
}

module.exports = { loadQuote, calculateQuote, materialUnitPrice };
