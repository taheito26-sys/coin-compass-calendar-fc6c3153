// Worker API base URL — set via VITE_WORKER_API_URL secret
const WORKER_BASE = (import.meta.env.VITE_WORKER_API_URL || "").replace(/\/$/, "");

let tokenProvider: null | (() => Promise<string | null>) = null;

export function setAuthTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

async function getAuthToken(): Promise<string | null> {
  if (!tokenProvider) return null;
  return tokenProvider();
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (!WORKER_BASE) {
    throw new Error("VITE_WORKER_API_URL is not configured.");
  }

  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${WORKER_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...((options?.headers as Record<string, string>) || {}),
    },
    signal: options?.signal ?? AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`API ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

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

export async function fetchAssets(): Promise<ApiAsset[]> {
  const response = await apiFetch<{ assets: ApiAsset[] }>("/api/assets");
  return response.assets;
}

export async function fetchTransactions(): Promise<ApiTransaction[]> {
  const response = await apiFetch<{ transactions: ApiTransaction[] }>("/api/transactions");
  return response.transactions;
}

export async function fetchPrices(): Promise<{ prices: Record<string, ApiPriceEntry>; ts: number; stale: boolean }> {
  const response = await apiFetch<ApiPricesResponse>("/api/prices");
  return {
    prices: response.prices ?? {},
    ts: response.ts ?? Date.now(),
    stale: response.stale ?? false,
  };
}

export async function fetchTrackingPreference(assetId?: string): Promise<{ tracking_mode: string } | null> {
  const query = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : "";
  const response = await apiFetch<{ preference: { tracking_mode: string } | null }>(`/api/tracking-preferences${query}`);
  return response.preference;
}

export async function fetchImportedFiles(): Promise<any[]> {
  const response = await apiFetch<{ files: any[] }>("/api/imported-files");
  return response.files;
}

export async function isWorkerAvailable(): Promise<boolean> {
  if (!WORKER_BASE) return false;
  try {
    const response = await fetch(`${WORKER_BASE}/api/status`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

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

export async function createTransaction(input: CreateTransactionInput): Promise<ApiTransaction> {
  const response = await apiFetch<{ transaction: ApiTransaction }>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.transaction;
}
export async function deleteTransaction(transactionId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/transactions/${transactionId}`, {
    method: "DELETE",
  });
}
export async function updateTransaction(
  transactionId: string,
  updates: Partial<CreateTransactionInput>,
): Promise<ApiTransaction> {
  const response = await apiFetch<{ transaction: ApiTransaction }>(`/api/transactions/${transactionId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  return response.transaction;
}
export interface CreateImportedFileInput {
  file_name: string;
  file_hash: string;
  exchange: string;
  export_type: string;
  row_count: number;
}

export async function createImportedFile(input: CreateImportedFileInput): Promise<any> {
  const response = await apiFetch<{ file: any }>("/api/imported-files", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.file;
}
export async function setTrackingPreference(trackingMode: string, assetId?: string): Promise<any> {
  const response = await apiFetch<{ preference: any }>("/api/tracking-preferences", {
    method: "PUT",
    body: JSON.stringify({
      tracking_mode: trackingMode,
      asset_id: assetId ?? null,
    }),
  });
  return response.preference;
}