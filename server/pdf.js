const PDFDocument = require('pdfkit');
const { allSettings } = require('./db');

function fmtMoney(n) {
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function generateQuotePdf(quote, stream) {
  const settings = allSettings();
  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  doc.pipe(stream);

  // ---------- Header ----------
  const leftX = 50;
  const rightX = 320;
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(settings.shop_name || 'Shop', leftX, 50);
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(settings.shop_address || '', leftX, doc.y, { width: 240 })
    .text(settings.shop_phone || '', leftX, doc.y)
    .text(settings.shop_email || '', leftX, doc.y);

  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .fillColor('#222')
    .text('QUOTE', rightX, 50, { align: 'right', width: 240 });
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#000')
    .text(`Reference: ${quote.reference || '-'}`, rightX, 80, { align: 'right', width: 240 })
    .text(`Date: ${fmtDate(quote.date)}`, rightX, doc.y, { align: 'right', width: 240 })
    .text(`Status: ${quote.status || 'Draft'}`, rightX, doc.y, { align: 'right', width: 240 });

  // ---------- Customer / Job block ----------
  let y = Math.max(doc.y, 150) + 10;
  doc
    .moveTo(leftX, y)
    .lineTo(560, y)
    .strokeColor('#ccc')
    .stroke();
  y += 10;

  doc.fontSize(9).fillColor('#666').font('Helvetica-Bold').text('CUSTOMER', leftX, y);
  doc.fontSize(9).fillColor('#666').font('Helvetica-Bold').text('JOB / PART', rightX, y);
  y += 12;
  doc.fontSize(11).fillColor('#000').font('Helvetica').text(quote.customer_name || '-', leftX, y);
  doc
    .fontSize(11)
    .fillColor('#000')
    .font('Helvetica')
    .text(quote.job_name || '-', rightX, y, { width: 240 });

  if (quote.drawing_number) {
    doc.fontSize(9).fillColor('#666').text(`Drawing #: ${quote.drawing_number}`, rightX, doc.y);
  }

  // ---------- Pricing table ----------
  y = Math.max(doc.y, y + 24) + 20;
  doc
    .fontSize(12)
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text('Pricing by Quantity', leftX, y);
  y = doc.y + 6;

  const cols = [
    { key: 'quantity', label: 'Quantity', width: 120, align: 'right' },
    { key: 'per_unit', label: 'Price Per Unit', width: 190, align: 'right' },
    { key: 'total', label: 'Total', width: 200, align: 'right' }
  ];

  function drawRow(values, opts = {}) {
    let x = leftX;
    const rowHeight = 18;
    if (opts.header) {
      doc.rect(leftX, y, 510, rowHeight).fill('#f0f0f0').fillColor('#000');
    } else if (opts.zebra) {
      doc.rect(leftX, y, 510, rowHeight).fill('#fafafa').fillColor('#000');
    }
    doc.font(opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000');
    cols.forEach((c, i) => {
      doc.text(values[i], x + 5, y + 5, {
        width: c.width - 10,
        align: c.align || 'left'
      });
      x += c.width;
    });
    y += rowHeight;
  }

  drawRow(cols.map((c) => c.label), { header: true });
  (quote.pricing?.rows || []).forEach((r, i) => {
    drawRow(
      [String(r.quantity), fmtMoney(r.per_unit), fmtMoney(r.total)],
      { zebra: i % 2 === 1 }
    );
  });

  // ---------- Materials detail ----------
  if (quote.materials && quote.materials.length) {
    y += 10;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Materials', leftX, y);
    y = doc.y + 4;
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    quote.materials.forEach((m) => {
      const name = m.current_name || m.material_name_snapshot || '(unnamed)';
      const unit = m.current_unit || m.unit_of_measure_snapshot || '';
      doc.text(
        `• ${name}  —  ${Number(m.quantity_needed_per_unit || 0)} ${unit} per unit`,
        leftX,
        y
      );
      y = doc.y;
    });
  }

  // ---------- Notes ----------
  if (quote.notes) {
    y += 12;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Notes', leftX, y);
    y = doc.y + 4;
    doc.fontSize(10).font('Helvetica').fillColor('#333').text(quote.notes, leftX, y, {
      width: 510
    });
    y = doc.y;
  }

  // ---------- Terms at bottom ----------
  const terms = settings.default_terms || 'Quote valid for 30 days.';
  const termsY = Math.max(y + 30, 700);
  doc
    .moveTo(leftX, termsY - 10)
    .lineTo(560, termsY - 10)
    .strokeColor('#ccc')
    .stroke();
  doc
    .fontSize(9)
    .font('Helvetica-Oblique')
    .fillColor('#555')
    .text(terms, leftX, termsY, { width: 510 });

  doc.end();
}

module.exports = { generateQuotePdf };
