import { useState, useEffect, useRef } from "react";

// Shared cache for sparkline data to avoid redundant fetches
const _sparkCache = new Map<string, number[]>();
const _sparkFetching = new Set<string>();

async function fetchSparkline(coinId: string): Promise<number[]> {
  if (_sparkCache.has(coinId)) return _sparkCache.get(coinId)!;
  if (_sparkFetching.has(coinId)) return [];
  _sparkFetching.add(coinId);
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7&interval=daily`
    );
    if (!r.ok) return [];
    const data = await r.json();
    const prices: number[] = (data.prices || []).map((p: [number, number]) => p[1]);
    _sparkCache.set(coinId, prices);
    return prices;
  } catch {
    return [];
  } finally {
    _sparkFetching.delete(coinId);
  }
}

/**
 * Fetches real 7-day sparkline data for a batch of coin IDs.
 * Rate-limited to avoid 429s — fetches sequentially with delays.
 */
export function useSparklineData(coinIds: string[]) {
  const [data, setData] = useState<Map<string, number[]>>(new Map());
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    // Only fetch IDs not already cached
    const toFetch = coinIds.filter(id => id && !_sparkCache.has(id));
    const alreadyCached = new Map<string, number[]>();
    for (const id of coinIds) {
      if (_sparkCache.has(id)) alreadyCached.set(id, _sparkCache.get(id)!);
    }
    if (alreadyCached.size > 0) setData(prev => new Map([...prev, ...alreadyCached]));

    if (toFetch.length === 0) return;

    let cancelled = false;
    queueRef.current = toFetch.slice(0, 20); // Limit to 20 to avoid rate limits

    (async () => {
      for (const id of queueRef.current) {
        if (cancelled) break;
        const prices = await fetchSparkline(id);
        if (!cancelled && prices.length > 0) {
          setData(prev => new Map([...prev, [id, prices]]));
        }
        // 1.5s delay between requests to respect rate limits
        await new Promise(r => setTimeout(r, 1500));
      }
    })();

    return () => { cancelled = true; };
  }, [coinIds.join(",")]);

  return data;
}
