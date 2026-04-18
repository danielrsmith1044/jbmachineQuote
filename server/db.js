const Database = require('better-sqlite3');
const { DB_FILE } = require('./paths');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  supplier TEXT,
  base_price REAL NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_pricing_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  min_quantity REAL NOT NULL,
  max_quantity REAL,
  price_per_unit REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE,
  customer_name TEXT,
  job_name TEXT,
  drawing_number TEXT,
  date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT 'Draft',
  labor_type TEXT NOT NULL DEFAULT 'hourly',
  labor_hours REAL NOT NULL DEFAULT 0,
  labor_rate REAL NOT NULL DEFAULT 0,
  labor_flat REAL NOT NULL DEFAULT 0,
  markup_percent REAL NOT NULL DEFAULT 0,
  notes TEXT,
  converted_to_job INTEGER NOT NULL DEFAULT 0,
  job_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_quantities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quote_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  material_name_snapshot TEXT,
  unit_of_measure_snapshot TEXT,
  quantity_needed_per_unit REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quote_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attachments_quote ON quote_attachments(quote_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(date);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_name);
CREATE INDEX IF NOT EXISTS idx_tiers_material ON material_pricing_tiers(material_id);
`);

// Seed default settings
const DEFAULT_SETTINGS = {
  shop_name: 'JB Machine Shop',
  shop_address: '123 Main St\nAnywhere, USA',
  shop_phone: '(555) 555-0100',
  shop_email: 'quotes@jbmachine.example',
  default_terms: 'Quote valid for 30 days from date issued. Prices subject to change after expiration.',
  default_labor_rate: '85',
  default_markup_percent: '0',
  quote_reference_prefix: 'Q',
  next_quote_number: '1001'
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  insertSetting.run(k, v);
}

function allSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value == null ? null : String(value));
}

function nextQuoteReference() {
  const prefix = getSetting.get('quote_reference_prefix')?.value || 'Q';
  const numRow = getSetting.get('next_quote_number');
  const n = parseInt(numRow?.value || '1001', 10);
  setSetting('next_quote_number', String(n + 1));
  return `${prefix}-${n}`;
}

module.exports = { db, allSettings, setSetting, nextQuoteReference };
