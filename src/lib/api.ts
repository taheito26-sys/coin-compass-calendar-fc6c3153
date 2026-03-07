/**
 * API client for the Cloudflare Worker backend.
 * Falls back to Supabase when the Worker is unavailable.
 */
import { supabase } from "@/lib/supabaseClient";

// Set this to your deployed Worker URL, e.g. "https://cryptotracker-api.your-account.workers.dev"
// When empty/null, all reads fall back to Supabase.
const WORKER_BASE = import.meta.env.VITE_WORKER_API_URL || "";

// ── Helpers ──────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function workerFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  if (!WORKER_BASE) return null;
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    const res = await fetch(`${WORKER_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string> ?? {}) },
      signal: options?.signal ?? AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Types matching Worker API responses ──────────────────────────

export interface ApiAsset {
  id: string;
  symbol: string;
  name: string;
  category: string;
  coingecko_id: string | null;
  binance_symbol: string | null;
  precision_qty: number;
  precision_price: number;
}

export interface ApiTransaction {
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
}

export interface ApiPriceEntry {
  price: number;
  change_1h: number | null;
  change_24h: number | null;
  change_7d: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  ts: number;
}

export interface ApiPricesResponse {
  prices: Record<string, ApiPriceEntry> | null;
  ts?: number;
  stale?: boolean;
}

// ── Data fetching with fallback ─────────────────────────────────

export async function fetchAssets(): Promise<ApiAsset[]> {
  // Try Worker
  const workerData = await workerFetch<{ assets: ApiAsset[] }>("/api/assets");
  if (workerData?.assets) return workerData.assets;

  // Fallback to Supabase
  const { data, error } = await supabase.from("assets").select("id, symbol, name, category, coingecko_id, binance_symbol, precision_qty, precision_price");
  if (error) throw error;
  return (data || []) as ApiAsset[];
}

export async function fetchTransactions(userId: string): Promise<ApiTransaction[]> {
  // Try Worker
  const workerData = await workerFetch<{ transactions: ApiTransaction[] }>("/api/transactions");
  if (workerData?.transactions) return workerData.transactions;

  // Fallback to Supabase
  const { data, error } = await supabase
    .from("transactions")
    .select("id, user_id, asset_id, timestamp, type, qty, unit_price, fee_amount, fee_currency, venue, note, tags, source, external_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []) as ApiTransaction[];
}

export async function fetchPrices(): Promise<{ prices: Record<string, ApiPriceEntry>; ts: number; stale: boolean }> {
  // Try Worker KV prices
  const workerData = await workerFetch<ApiPricesResponse>("/api/prices");
  if (workerData?.prices) {
    return {
      prices: workerData.prices,
      ts: workerData.ts ?? Date.now(),
      stale: workerData.stale ?? false,
    };
  }

  // Fallback: read from Supabase price_cache
  const { data, error } = await supabase
    .from("price_cache")
    .select("asset_id, price, price_change_1h, price_change_24h, price_change_7d, market_cap, volume_24h, timestamp");
  if (error) throw error;

  const prices: Record<string, ApiPriceEntry> = {};
  let latestTs = 0;
  for (const row of data || []) {
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
    prices[row.asset_id] = {
      price: row.price,
      change_1h: row.price_change_1h,
      change_24h: row.price_change_24h,
      change_7d: row.price_change_7d,
      market_cap: row.market_cap,
      volume_24h: row.volume_24h,
      ts,
    };
    if (ts > latestTs) latestTs = ts;
  }

  return { prices, ts: latestTs, stale: latestTs > 0 && Date.now() - latestTs > 600_000 };
}

export async function fetchTrackingPreference(userId: string, assetId?: string) {
  const workerData = await workerFetch<{ preference: { tracking_mode: string } | null }>(
    `/api/tracking-preferences${assetId ? `?asset_id=${assetId}` : ""}`
  );
  if (workerData !== null) return workerData.preference;

  // Fallback
  let query = supabase.from("tracking_preferences").select("*").eq("user_id", userId);
  if (assetId) query = query.eq("asset_id", assetId);
  else query = query.is("asset_id", null);
  const { data } = await query.maybeSingle();
  return data;
}

export async function fetchImportedFiles(userId: string) {
  const workerData = await workerFetch<{ files: any[] }>("/api/imported-files");
  if (workerData?.files) return workerData.files;

  const { data, error } = await supabase.from("imported_files").select("*").eq("user_id", userId);
  if (error) throw error;
  return data || [];
}

/** Check if the Worker backend is reachable */
export async function isWorkerAvailable(): Promise<boolean> {
  if (!WORKER_BASE) return false;
  try {
    const res = await fetch(`${WORKER_BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns which data source is active */
export function getDataSource(): "worker" | "supabase" {
  return WORKER_BASE ? "worker" : "supabase";
}

// ── Write operations ────────────────────────────────────────────

export interface CreateTransactionInput {
  asset_id: string;
  timestamp: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount?: number;
  fee_currency?: string;
  venue?: string;
  note?: string;
  tags?: string[];
  source?: string;
  external_id?: string;
}

export async function createTransaction(tx: CreateTransactionInput): Promise<ApiTransaction> {
  // Try Worker
  const workerData = await workerFetch<{ transaction: ApiTransaction }>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(tx),
  });
  if (workerData?.transaction) return workerData.transaction;

  // Fallback to Supabase
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...tx,
      user_id: user.id,
      fee_amount: tx.fee_amount ?? 0,
      fee_currency: tx.fee_currency ?? "USD",
      tags: tx.tags ?? null,
      source: tx.source ?? "manual",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ApiTransaction;
}

export async function deleteTransaction(txId: string): Promise<void> {
  // Try Worker
  const workerResult = await workerFetch<{ ok: boolean }>(`/api/transactions/${txId}`, {
    method: "DELETE",
  });
  if (workerResult !== null) return;

  // Fallback to Supabase
  const { error } = await supabase.from("transactions").delete().eq("id", txId);
  if (error) throw error;
}

export async function updateTransaction(txId: string, updates: Partial<CreateTransactionInput>): Promise<ApiTransaction> {
  // Try Worker
  const workerData = await workerFetch<{ transaction: ApiTransaction }>(`/api/transactions/${txId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  if (workerData?.transaction) return workerData.transaction;

  // Fallback to Supabase
  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", txId)
    .select()
    .single();
  if (error) throw error;
  return data as ApiTransaction;
}

export interface CreateImportedFileInput {
  file_name: string;
  file_hash: string;
  exchange: string;
  export_type: string;
  row_count: number;
}

export async function createImportedFile(file: CreateImportedFileInput): Promise<any> {
  // Try Worker
  const workerData = await workerFetch<{ file: any }>("/api/imported-files", {
    method: "POST",
    body: JSON.stringify(file),
  });
  if (workerData?.file) return workerData.file;

  // Fallback to Supabase
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("imported_files")
    .insert({ ...file, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setTrackingPreference(
  trackingMode: string,
  assetId?: string
): Promise<any> {
  // Try Worker
  const workerData = await workerFetch<{ preference: any }>("/api/tracking-preferences", {
    method: "PUT",
    body: JSON.stringify({ tracking_mode: trackingMode, asset_id: assetId ?? null }),
  });
  if (workerData?.preference) return workerData.preference;

  // Fallback to Supabase
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("tracking_preferences")
    .upsert({
      user_id: user.id,
      asset_id: assetId || null,
      tracking_mode: trackingMode,
    }, { onConflict: "user_id,asset_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
