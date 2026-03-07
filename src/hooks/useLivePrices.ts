import { useState, useEffect, useRef, useCallback } from "react";

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

// Singleton cache shared across all hook consumers
let _cache: LiveCoin[] = [];
let _cacheTs = 0;
let _fetching = false;
let _listeners: Set<() => void> = new Set();

const POLL_MS = 60_000; // 60s to avoid 429s
const STALE_MS = 55_000;

async function fetchPage(page: number, signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`,
    { signal }
  );
  if (r.status === 429) return []; // rate limited, skip
  if (!r.ok) return [];
  return r.json();
}

async function doFetch() {
  if (_fetching) return;
  _fetching = true;
  try {
    // Fetch 2 pages of 250 = 500 coins, sequentially to avoid 429
    const p1 = await fetchPage(1, AbortSignal.timeout(15000));
    // Small delay before next page
    await new Promise(r => setTimeout(r, 1500));
    const p2 = await fetchPage(2, AbortSignal.timeout(15000));
    const all = [...p1, ...p2];
    if (all.length > 0) {
      _cache = all;
      _cacheTs = Date.now();
      _listeners.forEach(cb => cb());
    }
  } catch {}
  _fetching = false;
}

let _intervalId: number | null = null;

function ensurePolling() {
  if (_intervalId) return;
  if (Date.now() - _cacheTs > STALE_MS) doFetch();
  _intervalId = window.setInterval(() => {
    if (Date.now() - _cacheTs > STALE_MS) doFetch();
  }, POLL_MS);
}

/** Shared hook – all consumers get the same cached data */
export function useLivePrices() {
  const [coins, setCoins] = useState<LiveCoin[]>(_cache);
  const [loading, setLoading] = useState(_cache.length === 0);

  useEffect(() => {
    const update = () => {
      setCoins(_cache);
      setLoading(false);
    };
    _listeners.add(update);
    ensurePolling();
    // If cache already populated, use it
    if (_cache.length > 0) { setCoins(_cache); setLoading(false); }
    return () => { _listeners.delete(update); };
  }, []);

  const priceMap = useRef(new Map<string, LiveCoin>());
  useEffect(() => {
    const m = new Map<string, LiveCoin>();
    for (const c of coins) m.set(c.symbol.toUpperCase(), c);
    priceMap.current = m;
  }, [coins]);

  const getPrice = useCallback((sym: string) => priceMap.current.get(sym.toUpperCase()) ?? null, []);

  return { coins, loading, getPrice, priceMap: priceMap.current };
}
