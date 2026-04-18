// Minimal delimited-text parser. Handles comma, tab, or semicolon;
// quoted fields with escaped quotes; CRLF or LF line endings.
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = {
    '\t': (firstLine.match(/\t/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

export function parseDelimited(text, delimiter) {
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"' && field === '') {
        inQuotes = true;
      } else if (ch === d) {
        cur.push(field);
        field = '';
      } else if (ch === '\n') {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

const HEADER_ALIASES = {
  name: ['name', 'material', 'description', 'item'],
  unit_of_measure: ['unit', 'uom', 'unit_of_measure', 'unit of measure', 'units'],
  supplier: ['supplier', 'vendor', 'source'],
  base_price: ['price', 'base_price', 'base price', 'unit_price', 'unit price', 'cost', '$/unit'],
  in_stock: ['in_stock', 'stock', 'in stock', 'available'],
  notes: ['notes', 'note', 'comments', 'comment']
};

export function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const norm = String(h || '').trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm)) {
        map[field] = i;
        return;
      }
    }
  });
  return map;
}

export function rowsToMaterials(rows, headerMap) {
  const out = [];
  for (const r of rows) {
    const get = (f) => (headerMap[f] != null ? r[headerMap[f]] : undefined);
    const name = (get('name') || '').trim();
    const unit = (get('unit_of_measure') || '').trim();
    if (!name && !unit) continue;
    out.push({
      name,
      unit_of_measure: unit,
      supplier: (get('supplier') || '').trim() || null,
      base_price: Number(String(get('base_price') ?? '').replace(/[$,\s]/g, '')) || 0,
      in_stock: get('in_stock'),
      notes: (get('notes') || '').trim() || null
    });
  }
  return out;
}
