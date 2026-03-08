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

// ─── CoinGecko market data (for Markets page) ─────────────
// Keep this for the bubbles/table view — unchanged singleton pattern.

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

let _cgCache: LiveCoin[] = [];
let _cgCacheTs = 0;
let _cgFetching = false;
let _cgListeners = new Set<() => void>();
let _cgBackoffMs = 0;
let _cgConsecutiveFails = 0;

const CG_POLL_MS = 180_000;
const CG_STALE_MS = 170_000;

async function fetchCgPage(page: number, signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`,
    { signal }
  );
  if (r.status === 429) {
    _cgConsecutiveFails++;
    _cgBackoffMs = Math.min(600_000, (2 ** _cgConsecutiveFails) * 60_000);
    return [];
  }
  if (!r.ok) return [];
  _cgConsecutiveFails = 0;
  _cgBackoffMs = 0;
  return r.json();
}

async function doCgFetch() {
  if (_cgFetching) return;
  if (_cgBackoffMs > 0 && Date.now() - _cgCacheTs < _cgBackoffMs) return;
  _cgFetching = true;
  try {
    const p1 = await fetchCgPage(1, AbortSignal.timeout(15000));
    if (p1.length > 0) {
      _cgCache = p1;
      _cgCacheTs = Date.now();
      _cgListeners.forEach(cb => cb());
      await new Promise(r => setTimeout(r, 5000));
      const p2 = await fetchCgPage(2, AbortSignal.timeout(15000));
      if (p2.length > 0) {
        _cgCache = [...p1, ...p2];
        _cgCacheTs = Date.now();
        _cgListeners.forEach(cb => cb());
      }
    }
  } catch {}
  _cgFetching = false;
}

let _cgIntervalId: number | null = null;

function ensureCgPolling() {
  if (_cgIntervalId) return;
  if (Date.now() - _cgCacheTs > CG_STALE_MS && !_cgFetching) doCgFetch();
  _cgIntervalId = window.setInterval(() => {
    if (Date.now() - _cgCacheTs > CG_STALE_MS && !_cgFetching) doCgFetch();
  }, CG_POLL_MS);
}

// ─── Shared hook ───────────────────────────────────────────

export function useLivePrices() {
  const { state } = useCrypto();

  // CoinGecko market data (for Markets page)
  const [cgCoins, setCgCoins] = useState<LiveCoin[]>(_cgCache);
  const [cgLoading, setCgLoading] = useState(_cgCache.length === 0);

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

  // 1. CoinGecko polling (unchanged — for Markets page)
  useEffect(() => {
    const update = () => {
      setCgCoins(_cgCache);
      setCgLoading(false);
    };
    _cgListeners.add(update);
    ensureCgPolling();
    if (_cgCache.length > 0) { setCgCoins(_cgCache); setCgLoading(false); }
    return () => { _cgListeners.delete(update); };
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
