const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
const DB_FILE = path.join(DATA_DIR, 'quoter.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

module.exports = { DATA_DIR, ATTACHMENTS_DIR, DB_FILE };
