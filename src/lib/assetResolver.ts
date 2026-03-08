import type { ApiAsset } from "@/lib/api";
import { fetchAssets, isWorkerConfigured } from "@/lib/api";
import { extractBaseFromPair, matchAssetBySymbol, normalizeSymbol } from "@/lib/symbolAliases";

const ASSET_CACHE_MS = 60_000;
let assetCache: ApiAsset[] = [];
let assetCacheTs = 0;

export async function getAssetCatalog(force = false): Promise<ApiAsset[]> {
  if (!isWorkerConfigured()) return [];

  if (!force && assetCache.length > 0 && Date.now() - assetCacheTs < ASSET_CACHE_MS) {
    return assetCache;
  }

  const assets = await fetchAssets();
  assetCache = assets;
  assetCacheTs = Date.now();
  return assets;
}

export function resolveAssetSymbol(rawSymbol: string): string {
  const trimmed = rawSymbol.trim();
  const base = /[\/_-]/.test(trimmed) ? extractBaseFromPair(trimmed) : normalizeSymbol(trimmed);
  return normalizeSymbol(base);
}

export function resolveAssetId(rawSymbol: string, assets: ApiAsset[]): { assetId: string | null; symbol: string } {
  const symbol = resolveAssetSymbol(rawSymbol);
  const assetId = matchAssetBySymbol(symbol, assets);
  return { assetId, symbol };
}
