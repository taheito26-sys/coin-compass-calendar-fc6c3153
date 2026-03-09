/**
 * useLivePrices.ts
 *
 * Shared hook for real-time crypto prices.
 * - Binance REST bootstrap on mount
 * - Binance WebSocket for live tick updates
 * - Falls back to CoinGecko for coins not on Binance
 * - Also keeps CoinGecko market data for Markets page (bubbles/table)
 *
 * The hook exposes both:
 *   1. `spotPrices` — Record<symbol, SpotPrice> from Binance WS (for portfolio/dashboard)
 *   2. `coins` — LiveCoin[] from CoinGecko (for Markets page bubbles/table)
 *   3. `getPrice(sym)` — merged getter: WS price first, then CoinGecko, then null
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSpotPrices,
  subscribeLivePrices,
  getWsPrices,
  BINANCE_SYMBOLS,
  KNOWN_IDS,
  type SpotPrice,
} from "@/lib/priceProvider";
import { useCrypto } from "@/lib/cryptoContext";
import { normalizeSymbol } from "@/lib/symbolAliases";

export interface LiveCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number;
  image: string;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}

// ─── Multi-source market data with cascading fallback ──────
// Priority: CoinGecko → CoinCap → CoinPaprika → CryptoCompare → Binance REST
// If the primary source fails, automatically tries the next one.

let _marketCache: LiveCoin[] = [];
let _marketCacheTs = 0;
let _marketFetching = false;
let _marketListeners = new Set<() => void>();
let _lastSource = "";

const POLL_MS = 180_000;
const STALE_MS = 170_000;

function notifyListeners() {
  _marketListeners.forEach(cb => cb());
}

// ── Source 1: CoinGecko ────────────────────────────────────
async function fetchCoinGecko(signal: AbortSignal): Promise<LiveCoin[]> {
  const url = (page: number) =>
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`;
  const r = await fetch(url(1), { signal });
  if (!r.ok) throw new Error(`CG ${r.status}`);
  const p1: any[] = await r.json();
  if (!p1.length) throw new Error("CG empty");
  // Try page 2 in background
  try {
    await new Promise(r => setTimeout(r, 3000));
    const r2 = await fetch(url(2), { signal: AbortSignal.timeout(10000) });
    if (r2.ok) {
      const p2: any[] = await r2.json();
      if (p2.length) return [...p1, ...p2];
    }
  } catch {}
  return p1;
}

// ── Source 2: CoinCap v2 ───────────────────────────────────
async function fetchCoinCap(signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch("https://api.coincap.io/v2/assets?limit=250", { signal });
  if (!r.ok) throw new Error(`CoinCap ${r.status}`);
  const { data } = await r.json();
  if (!data?.length) throw new Error("CoinCap empty");
  return data.map((c: any, i: number) => ({
    id: c.id,
    symbol: (c.symbol || "").toLowerCase(),
    name: c.name || c.id,
    current_price: parseFloat(c.priceUsd) || 0,
    market_cap: parseFloat(c.marketCapUsd) || 0,
    total_volume: parseFloat(c.volumeUsd24Hr) || 0,
    market_cap_rank: parseInt(c.rank) || i + 1,
    image: "",
    price_change_percentage_1h_in_currency: null,
    price_change_percentage_24h_in_currency: parseFloat(c.changePercent24Hr) || null,
    price_change_percentage_7d_in_currency: null,
  }));
}

// ── Source 3: CoinPaprika ──────────────────────────────────
async function fetchCoinPaprika(signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch("https://api.coinpaprika.com/v1/tickers?limit=250", { signal });
  if (!r.ok) throw new Error(`Paprika ${r.status}`);
  const data: any[] = await r.json();
  if (!data?.length) throw new Error("Paprika empty");
  return data.map((c: any, i: number) => ({
    id: c.id,
    symbol: (c.symbol || "").toLowerCase(),
    name: c.name || c.id,
    current_price: c.quotes?.USD?.price || 0,
    market_cap: c.quotes?.USD?.market_cap || 0,
    total_volume: c.quotes?.USD?.volume_24h || 0,
    market_cap_rank: c.rank || i + 1,
    image: "",
    price_change_percentage_1h_in_currency: c.quotes?.USD?.percent_change_1h || null,
    price_change_percentage_24h_in_currency: c.quotes?.USD?.percent_change_24h || null,
    price_change_percentage_7d_in_currency: c.quotes?.USD?.percent_change_7d || null,
  }));
}

// ── Source 4: CryptoCompare ────────────────────────────────
async function fetchCryptoCompare(signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch(
    "https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&tsym=USD",
    { signal }
  );
  if (!r.ok) throw new Error(`CC ${r.status}`);
  const { Data } = await r.json();
  if (!Data?.length) throw new Error("CC empty");
  return Data.map((c: any, i: number) => {
    const raw = c.RAW?.USD || {};
    const display = c.CoinInfo || {};
    return {
      id: (display.Name || "").toLowerCase(),
      symbol: (display.Name || "").toLowerCase(),
      name: display.FullName || display.Name || "",
      current_price: raw.PRICE || 0,
      market_cap: raw.MKTCAP || 0,
      total_volume: raw.TOTALVOLUME24HTO || 0,
      market_cap_rank: i + 1,
      image: display.ImageUrl ? `https://www.cryptocompare.com${display.ImageUrl}` : "",
      price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h_in_currency: raw.CHANGEPCT24HOUR || null,
      price_change_percentage_7d_in_currency: null,
    };
  });
}

// ── Source 5: Binance REST ticker ──────────────────────────
async function fetchBinanceTicker(signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal });
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const data: any[] = await r.json();
  if (!data?.length) throw new Error("Binance empty");
  // Only USDT pairs, deduplicate by base symbol
  const seen = new Set<string>();
  const out: LiveCoin[] = [];
  for (const t of data) {
    if (!t.symbol?.endsWith("USDT")) continue;
    const base = t.symbol.replace("USDT", "").toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({
      id: base,
      symbol: base,
      name: base.toUpperCase(),
      current_price: parseFloat(t.lastPrice) || 0,
      market_cap: 0,
      total_volume: parseFloat(t.quoteVolume) || 0,
      market_cap_rank: out.length + 1,
      image: "",
      price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h_in_currency: parseFloat(t.priceChangePercent) || null,
      price_change_percentage_7d_in_currency: null,
    });
  }
  // Sort by volume descending as rough proxy for market cap rank
  out.sort((a, b) => b.total_volume - a.total_volume);
  out.forEach((c, i) => { c.market_cap_rank = i + 1; });
  return out.slice(0, 500);
}

// ── Cascading fetch with fallback ──────────────────────────
const SOURCES: { name: string; fn: (s: AbortSignal) => Promise<LiveCoin[]> }[] = [
  { name: "CoinGecko", fn: fetchCoinGecko },
  { name: "CoinCap", fn: fetchCoinCap },
  { name: "CoinPaprika", fn: fetchCoinPaprika },
  { name: "CryptoCompare", fn: fetchCryptoCompare },
  { name: "Binance", fn: fetchBinanceTicker },
];

async function doMarketFetch() {
  if (_marketFetching) return;
  _marketFetching = true;
  try {
    for (const source of SOURCES) {
      try {
        const coins = await source.fn(AbortSignal.timeout(15000));
        if (coins.length > 0) {
          _marketCache = coins;
          _marketCacheTs = Date.now();
          _lastSource = source.name;
          console.log(`[Prices] Loaded ${coins.length} coins from ${source.name}`);
          notifyListeners();
          return;
        }
      } catch (err) {
        console.warn(`[Prices] ${source.name} failed:`, err instanceof Error ? err.message : err);
        continue; // Try next source
      }
    }
    console.warn("[Prices] All sources failed, keeping stale cache");
  } finally {
    _marketFetching = false;
  }
}

// Also persist to localStorage for resilience across reloads
const LS_CACHE_KEY = "lt_market_cache";
function persistCache() {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ ts: _marketCacheTs, src: _lastSource, data: _marketCache.slice(0, 500) }));
  } catch {}
}
function restoreCache() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return;
    const { ts, data } = JSON.parse(raw);
    // Use cached data if less than 30 minutes old
    if (data?.length && Date.now() - ts < 1_800_000) {
      _marketCache = data;
      _marketCacheTs = ts;
    }
  } catch {}
}

// Initialize from localStorage
restoreCache();

let _pollIntervalId: number | null = null;

function ensureMarketPolling() {
  if (_pollIntervalId) return;
  if (Date.now() - _marketCacheTs > STALE_MS && !_marketFetching) {
    doMarketFetch().then(persistCache);
  }
  _pollIntervalId = window.setInterval(() => {
    if (Date.now() - _marketCacheTs > STALE_MS && !_marketFetching) {
      doMarketFetch().then(persistCache);
    }
  }, POLL_MS);
}

// ─── Shared hook ───────────────────────────────────────────

export function useLivePrices() {
  const { state } = useCrypto();

  // Market data (multi-source with fallback)
  const [marketCoins, setMarketCoins] = useState<LiveCoin[]>(_marketCache);
  const [marketLoading, setMarketLoading] = useState(_marketCache.length === 0);

  // Binance spot prices (for portfolio pricing)
  const [spotPrices, setSpotPrices] = useState<Record<string, SpotPrice>>({});
  const [wsRevision, setWsRevision] = useState(0);
  const bootstrapDoneRef = useRef(false);

  // Derive unique asset symbols from transactions
  const assetSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const tx of state.txs) {
      const sym = normalizeSymbol(tx.asset || "");
      if (sym) set.add(sym);
    }
    // Also include watchlist
    for (const w of state.watch || []) {
      set.add(w.toUpperCase());
    }
    return [...set];
  }, [state.txs, state.watch]);

  // 1. Multi-source market data polling
  useEffect(() => {
    const update = () => {
      setMarketCoins(_marketCache);
      setMarketLoading(false);
    };
    _marketListeners.add(update);
    ensureMarketPolling();
    if (_marketCache.length > 0) { setMarketCoins(_marketCache); setMarketLoading(false); }
    return () => { _marketListeners.delete(update); };
  }, []);

  // 2. Binance REST bootstrap when asset list changes
  useEffect(() => {
    if (assetSymbols.length === 0) return;

    let cancelled = false;
    const assets = assetSymbols.map(sym => ({
      sym,
      coingeckoId: KNOWN_IDS[sym] || null,
    }));

    getSpotPrices(assets).then(prices => {
      if (!cancelled) {
        setSpotPrices(prices);
        bootstrapDoneRef.current = true;
      }
    });

    return () => { cancelled = true; };
  }, [assetSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Binance WebSocket subscription
  useEffect(() => {
    if (assetSymbols.length === 0) return;

    const unsub = subscribeLivePrices(assetSymbols, () => {
      setWsRevision(r => r + 1);
    });

    return unsub;
  }, [assetSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build CoinGecko price map for quick lookup
  const cgPriceMap = useRef(new Map<string, LiveCoin>());
  useEffect(() => {
    const m = new Map<string, LiveCoin>();
    for (const c of cgCoins) m.set(c.symbol.toUpperCase(), c);
    cgPriceMap.current = m;
  }, [cgCoins]);

  // Merge WS prices with REST bootstrap
  const mergedPrices = useMemo(() => {
    const ws = getWsPrices();
    const merged = { ...spotPrices };
    for (const [sym, p] of Object.entries(ws)) {
      merged[sym] = p; // WS always overrides REST
    }
    return merged;
  }, [spotPrices, wsRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unified price getter: WS/Binance → CoinGecko → null
  const getPrice = useCallback((sym: string): LiveCoin | null => {
    const key = sym.toUpperCase();

    // Check CoinGecko data first (has full LiveCoin interface)
    const cg = cgPriceMap.current.get(key);

    // Check Binance data
    const binance = mergedPrices[key];

    if (cg && binance) {
      // Return CoinGecko shape but with Binance real-time price
      return {
        ...cg,
        current_price: binance.price,
        price_change_percentage_24h_in_currency: binance.change24h,
      };
    }

    if (binance) {
      // Synthetic LiveCoin from Binance-only data
      return {
        id: KNOWN_IDS[key] || key.toLowerCase(),
        symbol: key.toLowerCase(),
        name: key,
        current_price: binance.price,
        market_cap: 0,
        total_volume: 0,
        market_cap_rank: 9999,
        image: "",
        price_change_percentage_1h_in_currency: null,
        price_change_percentage_24h_in_currency: binance.change24h,
        price_change_percentage_7d_in_currency: null,
      };
    }

    if (cg) return cg;
    return null;
  }, [mergedPrices, cgCoins]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    coins: cgCoins,
    loading: cgLoading,
    getPrice,
    priceMap: cgPriceMap.current,
    spotPrices: mergedPrices,
  };
}
