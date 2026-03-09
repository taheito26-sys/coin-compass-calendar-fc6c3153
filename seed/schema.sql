-- CryptoTracker D1 Schema
-- Cloudflare D1 relational tables

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  coingecko_id TEXT,
  binance_symbol TEXT,
  category TEXT DEFAULT 'other',
  precision_qty INTEGER DEFAULT 8,
  precision_price INTEGER DEFAULT 8,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('buy','sell','transfer_in','transfer_out','reward','fee','adjustment')),
  qty REAL NOT NULL,
  unit_price REAL DEFAULT 0,
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  venue TEXT,
  note TEXT,
  tags TEXT,
  source TEXT DEFAULT 'manual',
  external_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_asset ON transactions(user_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_ts ON transactions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tx_external ON transactions(external_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_external_id ON transactions(user_id, external_id);

CREATE TABLE IF NOT EXISTS tracking_preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL DEFAULT '__global__',
  tracking_mode TEXT NOT NULL DEFAULT 'fifo',
  UNIQUE(user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS imported_files (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  exchange TEXT NOT NULL,
  export_type TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, file_hash)
);
CREATE INDEX IF NOT EXISTS idx_imported_user ON imported_files(user_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_prefs_user ON user_preferences(user_id);

-- ─────────────────────────────────────────────────────────────
-- Import audit tables (v2)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  source_exchange TEXT,
  source_export_type TEXT,
  parsed_count INTEGER DEFAULT 0,
  accepted_new_count INTEGER DEFAULT 0,
  already_imported_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  invalid_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,
  persisted_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_import_batches_user ON import_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_filehash ON import_batches(user_id, file_hash);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  user_id TEXT NOT NULL,
  source_row_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  fingerprint_hash TEXT,
  native_id TEXT,
  canonical_json TEXT,
  transaction_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_import_rows_batch ON import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_user ON import_rows(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS import_row_fingerprints (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  native_id TEXT,
  source_exchange TEXT,
  source_export_type TEXT,
  canonical_json TEXT,
  transaction_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, fingerprint_hash)
);
CREATE INDEX IF NOT EXISTS idx_import_fp_user_native ON import_row_fingerprints(user_id, native_id);
