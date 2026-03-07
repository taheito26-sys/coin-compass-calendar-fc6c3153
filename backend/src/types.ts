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
