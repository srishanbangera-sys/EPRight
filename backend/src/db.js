import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'epright.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('PRODUCER','RECYCLER','PLATFORM')),
  name TEXT NOT NULL,
  gst_no TEXT, cpcb_reg_id TEXT, location TEXT, contact TEXT,
  categories TEXT DEFAULT '[]',
  monthly_capacity_t REAL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','AT_RISK','EXPIRED','REJECTED')),
  is_sample INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PRODUCER','RECYCLER','ADMIN')),
  organization_id INTEGER REFERENCES organizations(id),
  is_demo INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL, number TEXT, valid_from TEXT, valid_to TEXT, file_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producer_id INTEGER NOT NULL REFERENCES organizations(id),
  file_url TEXT, file_name TEXT,
  invoice_number TEXT, invoice_date TEXT, seller_name TEXT, buyer_name TEXT,
  extracted_json TEXT, extraction_source TEXT,
  confirmed INTEGER DEFAULT 0,
  financial_year TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT, packaging_type TEXT, quantity_tonnes REAL NOT NULL, category TEXT NOT NULL, confidence REAL
);
CREATE TABLE IF NOT EXISTS settings_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  financial_year TEXT NOT NULL, category TEXT NOT NULL, target_pct REAL NOT NULL,
  UNIQUE (financial_year, category)
);
CREATE TABLE IF NOT EXISTS settings_global (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recycler_id INTEGER NOT NULL REFERENCES organizations(id),
  category TEXT NOT NULL,
  tonnes_total REAL NOT NULL, tonnes_available REAL NOT NULL,
  price_per_tonne REAL NOT NULL,
  expected_completion TEXT NOT NULL,
  facility TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SOLD_OUT','HIDDEN')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  producer_id INTEGER NOT NULL REFERENCES organizations(id),
  recycler_id INTEGER NOT NULL REFERENCES organizations(id),
  category TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  tonnes REAL NOT NULL, price_per_tonne REAL NOT NULL, total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLACED',
  escrow_status TEXT NOT NULL DEFAULT 'NONE' CHECK (escrow_status IN ('NONE','HELD','RELEASED','REFUNDED')),
  expected_completion TEXT,
  safety_status TEXT, safety_score INTEGER,
  delivered_certificate_id TEXT, delivered_tonnes REAL, delivered_category TEXT, delivered_issue_date TEXT, delivered_at TEXT,
  received_at TEXT, receipt_screenshot_url TEXT,
  validation_reasons TEXT,
  pre_dispute_status TEXT,
  payment_ref TEXT,
  is_sample INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS order_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  file_url TEXT NOT NULL, file_name TEXT, type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producer_id INTEGER NOT NULL REFERENCES organizations(id),
  order_id INTEGER REFERENCES orders(id),
  certificate_id TEXT NOT NULL UNIQUE,
  recycler_name TEXT, recycler_id INTEGER,
  category TEXT NOT NULL, tonnes REAL NOT NULL, issue_date TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('PLATFORM','EXTERNAL')),
  source_name TEXT,
  price_per_tonne REAL, document_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VALIDATED','FLAGGED')),
  validation_reasons TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  from_org INTEGER NOT NULL, to_org INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5), comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (order_id, from_org)
);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  raised_by INTEGER NOT NULL, raised_by_role TEXT,
  reason TEXT NOT NULL, evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','MORE_PROOF')),
  decision TEXT, decision_note TEXT, decided_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, org_id INTEGER, audience_role TEXT,
  type TEXT NOT NULL, severity TEXT DEFAULT 'info', message TEXT NOT NULL, link TEXT,
  dedupe_key TEXT UNIQUE,
  read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  actor_id INTEGER, actor_role TEXT,
  action TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
  payload TEXT NOT NULL,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_tamper (
  event_id INTEGER PRIMARY KEY, original_payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_producer ON orders(producer_id);
CREATE INDEX IF NOT EXISTS idx_orders_recycler ON orders(recycler_id);
CREATE INDEX IF NOT EXISTS idx_credits_producer ON credits(producer_id);
`;

db.exec(SCHEMA);

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings_global WHERE key = ?', key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  run('INSERT INTO settings_global(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export function resetDatabase() {
  const tables = ['event_scope', 'demo_tamper', 'events', 'alerts', 'disputes', 'ratings', 'credits', 'order_proofs', 'orders', 'listings', 'invoice_items', 'invoices', 'documents', 'users', 'organizations', 'settings_targets', 'settings_global'];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  db.exec(`CREATE TABLE IF NOT EXISTS event_scope (event_id INTEGER PRIMARY KEY, org_ids TEXT)`);
}

export const parseJson = (s, fb = null) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
