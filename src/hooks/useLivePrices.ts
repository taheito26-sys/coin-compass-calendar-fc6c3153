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
let _backoffMs = 0;
let _consecutiveFails = 0;
let _fetchPromise: Promise<void> | null = null;

const POLL_MS = 180_000; // 180s between polls
const STALE_MS = 170_000;

async function fetchPage(page: number, signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`,
    { signal }
  );
  if (r.status === 429) {
    _consecutiveFails++;
    _backoffMs = Math.min(600_000, (2 ** _consecutiveFails) * 60_000);
    return [];
  }
  if (!r.ok) return [];
  _consecutiveFails = 0;
  _backoffMs = 0;
  return r.json();
}

async function doFetch() {
  if (_fetching) return;
  if (_backoffMs > 0 && Date.now() - _cacheTs < _backoffMs) return;
  _fetching = true;
  try {
    const p1 = await fetchPage(1, AbortSignal.timeout(15000));
    if (p1.length > 0) {
      _cache = p1;
      _cacheTs = Date.now();
      _listeners.forEach(cb => cb());

      // Page 2 after 5s delay
      await new Promise(r => setTimeout(r, 5000));
      const p2 = await fetchPage(2, AbortSignal.timeout(15000));
      if (p2.length > 0) {
        _cache = [...p1, ...p2];
        _cacheTs = Date.now();
        _listeners.forEach(cb => cb());
      }
    }
  } catch {}
  _fetching = false;
}

let _intervalId: number | null = null;

function ensurePolling() {
  if (_intervalId) return;
  if (Date.now() - _cacheTs > STALE_MS && !_fetching) doFetch();
  _intervalId = window.setInterval(() => {
    if (Date.now() - _cacheTs > STALE_MS && !_fetching) doFetch();
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
