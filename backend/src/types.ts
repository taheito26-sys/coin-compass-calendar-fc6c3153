/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
  PRICE_KV: KVNamespace;
  CLERK_JWKS_URL?: string;
  ALLOWED_ORIGINS?: string;
}

/** D1 row types — mirror the approved schema */

export interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  coingecko_id: string | null;
  binance_symbol: string | null;
  category: string;
  precision_qty: number;
  precision_price: number;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  asset_id: string;
  timestamp: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
  fee_currency: string;
  venue: string | null;
  note: string | null;
  tags: string | null;
  source: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackingPreferenceRow {
  id: string;
  user_id: string;
  asset_id: string;
  tracking_mode: string;
}

export interface ImportedFileRow {
  id: string;
  user_id: string;
  file_name: string;
  file_hash: string;
  exchange: string;
  export_type: string;
  row_count: number;
  imported_at: string;
}

export interface ImportBatchRow {
  id: string;
  user_id: string;
  file_name: string;
  file_hash: string;
  source_exchange: string | null;
  source_export_type: string | null;
  parsed_count: number;
  accepted_new_count: number;
  already_imported_count: number;
  warning_count: number;
  invalid_count: number;
  conflict_count: number;
  persisted_count: number;
  failed_count: number;
  created_at: string;
}

export interface ImportRowRow {
  id: string;
  batch_id: string;
  user_id: string;
  source_row_index: number;
  status: string;
  message: string | null;
  fingerprint_hash: string | null;
  native_id: string | null;
  canonical_json: string | null;
  transaction_id: string | null;
  created_at: string;
}

export interface ImportFingerprintRow {
  id: string;
  user_id: string;
  fingerprint_hash: string;
  native_id: string | null;
  source_exchange: string | null;
  source_export_type: string | null;
  canonical_json: string | null;
  transaction_id: string | null;
  created_at: string;
}

export interface UserPreferenceRow {
  id: string;
  user_id: string;
  key: string;
  value: string;
}

/** KV price data shape */
export interface PriceEntry {
  price: number;
  change_1h: number | null;
  change_24h: number | null;
  change_7d: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  ts: number;
}

export interface PriceSnapshot {
  prices: Record<string, PriceEntry>;
  ts: number;
}

export interface MiniSnapshot {
  ts: number;
  prices: Record<string, number>; // asset_id -> price
}
