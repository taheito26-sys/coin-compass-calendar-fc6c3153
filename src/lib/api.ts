/**
 * API client — Cloudflare Worker is the ONLY backend.
 * No fallback. All data flows through the Worker API.
 *
 * Environment:
 *   VITE_WORKER_API_URL — public deployed Worker URL (required for production)
 *   Falls back to empty string for development (will show connection errors)
 */

const WORKER_BASE = import.meta.env.VITE_WORKER_API_URL || "";

// ── Auth token ──────────────────────────────────────────────────

let _getToken: (() => Promise<string | null>) | null = null;

/** Called once at app init to provide the Clerk getToken function */
export function setAuthTokenProvider(provider: () => Promise<string | null>) {
  _getToken = provider;
}

async function getAuthToken(): Promise<string | null> {
  if (!_getToken) return null;
  return _getToken();
}

// ── Core fetch helper ───────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (!WORKER_BASE) {
    throw new Error("VITE_WORKER_API_URL is not configured. Set it to your deployed Worker URL.");
  }
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${WORKER_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> ?? {}) },
    signal: options?.signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`API ${res.status}: ${errorText}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ───────────────────────────────────────────────────────

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

// ── Data fetching (Worker-only) ─────────────────────────────────

export async function fetchAssets(): Promise<ApiAsset[]> {
  const res = await apiFetch<{ assets: ApiAsset[] }>("/api/assets");
  return res.assets;
}

export async function fetchTransactions(): Promise<ApiTransaction[]> {
  const res = await apiFetch<{ transactions: ApiTransaction[] }>("/api/transactions");
  return res.transactions;
}

export async function fetchPrices(): Promise<{ prices: Record<string, ApiPriceEntry>; ts: number; stale: boolean }> {
  const res = await apiFetch<ApiPricesResponse>("/api/prices");
  return {
    prices: res.prices ?? {},
    ts: res.ts ?? Date.now(),
    stale: res.stale ?? false,
  };
}

export async function fetchTrackingPreference(assetId?: string) {
  const res = await apiFetch<{ preference: { tracking_mode: string } | null }>(
    `/api/tracking-preferences${assetId ? `?asset_id=${assetId}` : ""}`
  );
  return res.preference;
}

export async function fetchImportedFiles() {
  const res = await apiFetch<{ files: any[] }>("/api/imported-files");
  return res.files;
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
  const res = await apiFetch<{ transaction: ApiTransaction }>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(tx),
  });
  return res.transaction;
}

export async function deleteTransaction(txId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/transactions/${txId}`, { method: "DELETE" });
}

export async function updateTransaction(txId: string, updates: Partial<CreateTransactionInput>): Promise<ApiTransaction> {
  const res = await apiFetch<{ transaction: ApiTransaction }>(`/api/transactions/${txId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  return res.transaction;
}

export interface CreateImportedFileInput {
  file_name: string;
  file_hash: string;
  exchange: string;
  export_type: string;
  row_count: number;
}

export async function createImportedFile(file: CreateImportedFileInput): Promise<any> {
  const res = await apiFetch<{ file: any }>("/api/imported-files", {
    method: "POST",
    body: JSON.stringify(file),
  });
  return res.file;
}

export async function setTrackingPreference(trackingMode: string, assetId?: string): Promise<any> {
  const res = await apiFetch<{ preference: any }>("/api/tracking-preferences", {
    method: "PUT",
    body: JSON.stringify({ tracking_mode: trackingMode, asset_id: assetId ?? null }),
  });
  return res.preference;
}
