import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

interface MarketCoin {
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

// ── Source 1: CoinGecko ────────────────────────────────────
async function fetchCoinGecko(): Promise<MarketCoin[]> {
  const url = (page: number) =>
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`;
  const r = await fetch(url(1), { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`CG ${r.status}`);
  const p1: MarketCoin[] = await r.json();
  if (!p1.length) throw new Error('CG empty');
  // Try page 2
  try {
    await new Promise(r => setTimeout(r, 2000));
    const r2 = await fetch(url(2), { signal: AbortSignal.timeout(10000) });
    if (r2.ok) {
      const p2: MarketCoin[] = await r2.json();
      if (p2.length) return [...p1, ...p2];
    }
  } catch {}
  return p1;
}

// ── Source 2: CoinCap v2 ───────────────────────────────────
async function fetchCoinCap(): Promise<MarketCoin[]> {
  const r = await fetch('https://api.coincap.io/v2/assets?limit=250', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`CoinCap ${r.status}`);
  const { data } = await r.json() as { data: any[] };
  if (!data?.length) throw new Error('CoinCap empty');
  return data.map((c: any, i: number) => ({
    id: c.id,
    symbol: (c.symbol || '').toLowerCase(),
    name: c.name || c.id,
    current_price: parseFloat(c.priceUsd) || 0,
    market_cap: parseFloat(c.marketCapUsd) || 0,
    total_volume: parseFloat(c.volumeUsd24Hr) || 0,
    market_cap_rank: parseInt(c.rank) || i + 1,
    image: '',
    price_change_percentage_1h_in_currency: null,
    price_change_percentage_24h_in_currency: parseFloat(c.changePercent24Hr) || null,
    price_change_percentage_7d_in_currency: null,
  }));
}

// ── Source 3: CoinPaprika ──────────────────────────────────
async function fetchCoinPaprika(): Promise<MarketCoin[]> {
  const r = await fetch('https://api.coinpaprika.com/v1/tickers?limit=250', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Paprika ${r.status}`);
  const data: any[] = await r.json();
  if (!data?.length) throw new Error('Paprika empty');
  return data.map((c: any, i: number) => ({
    id: c.id,
    symbol: (c.symbol || '').toLowerCase(),
    name: c.name || c.id,
    current_price: c.quotes?.USD?.price || 0,
    market_cap: c.quotes?.USD?.market_cap || 0,
    total_volume: c.quotes?.USD?.volume_24h || 0,
    market_cap_rank: c.rank || i + 1,
    image: '',
    price_change_percentage_1h_in_currency: c.quotes?.USD?.percent_change_1h || null,
    price_change_percentage_24h_in_currency: c.quotes?.USD?.percent_change_24h || null,
    price_change_percentage_7d_in_currency: c.quotes?.USD?.percent_change_7d || null,
  }));
}

// ── Source 4: CryptoCompare ────────────────────────────────
async function fetchCryptoCompare(): Promise<MarketCoin[]> {
  const r = await fetch('https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&tsym=USD', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`CC ${r.status}`);
  const { Data } = await r.json() as { Data: any[] };
  if (!Data?.length) throw new Error('CC empty');
  return Data.map((c: any, i: number) => {
    const raw = c.RAW?.USD || {};
    const info = c.CoinInfo || {};
    return {
      id: (info.Name || '').toLowerCase(),
      symbol: (info.Name || '').toLowerCase(),
      name: info.FullName || info.Name || '',
      current_price: raw.PRICE || 0,
      market_cap: raw.MKTCAP || 0,
      total_volume: raw.TOTALVOLUME24HTO || 0,
      market_cap_rank: i + 1,
      image: info.ImageUrl ? `https://www.cryptocompare.com${info.ImageUrl}` : '',
      price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h_in_currency: raw.CHANGEPCT24HOUR || null,
      price_change_percentage_7d_in_currency: null,
    };
  });
}

// ── Source 5: Binance REST ticker ──────────────────────────
async function fetchBinanceTicker(): Promise<MarketCoin[]> {
  const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const data: any[] = await r.json();
  if (!data?.length) throw new Error('Binance empty');
  const seen = new Set<string>();
  const out: MarketCoin[] = [];
  for (const t of data) {
    if (!t.symbol?.endsWith('USDT')) continue;
    const base = t.symbol.replace('USDT', '').toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({
      id: base, symbol: base, name: base.toUpperCase(),
      current_price: parseFloat(t.lastPrice) || 0,
      market_cap: 0,
      total_volume: parseFloat(t.quoteVolume) || 0,
      market_cap_rank: out.length + 1,
      image: '',
      price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h_in_currency: parseFloat(t.priceChangePercent) || null,
      price_change_percentage_7d_in_currency: null,
    });
  }
  out.sort((a, b) => b.total_volume - a.total_volume);
  out.forEach((c, i) => { c.market_cap_rank = i + 1; });
  return out.slice(0, 500);
}

const SOURCES = [
  { name: 'CoinGecko', fn: fetchCoinGecko },
  { name: 'CoinCap', fn: fetchCoinCap },
  { name: 'CoinPaprika', fn: fetchCoinPaprika },
  { name: 'CryptoCompare', fn: fetchCryptoCompare },
  { name: 'Binance', fn: fetchBinanceTicker },
];

const KV_CACHE_KEY = 'market:coins';
const KV_CACHE_TTL = 300; // 5 min

/**
 * GET /api/market-data — public, no auth required
 * Proxies market data from multiple sources with cascading fallback.
 * Caches in KV for 5 minutes to minimize upstream calls.
 */
app.get('/', async (c) => {
  // 1. Check KV cache first
  try {
    const cached = await c.env.PRICE_KV.get(KV_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Only use cache if less than 5 minutes old
      if (parsed.ts && Date.now() - parsed.ts < KV_CACHE_TTL * 1000) {
        return c.json({ coins: parsed.coins, source: parsed.source, ts: parsed.ts, cached: true });
      }
    }
  } catch {}

  // 2. Try each source in order
  for (const source of SOURCES) {
    try {
      const coins = await source.fn();
      if (coins.length > 0) {
        const payload = { coins, source: source.name, ts: Date.now() };
        // Store in KV cache (fire and forget)
        c.executionCtx.waitUntil(
          c.env.PRICE_KV.put(KV_CACHE_KEY, JSON.stringify(payload), { expirationTtl: KV_CACHE_TTL })
        );
        console.log(`[market-data] Served ${coins.length} coins from ${source.name}`);
        return c.json({ ...payload, cached: false });
      }
    } catch (err: any) {
      console.warn(`[market-data] ${source.name} failed: ${err?.message}`);
      continue;
    }
  }

  // 3. All failed — try returning stale KV cache
  try {
    const stale = await c.env.PRICE_KV.get(KV_CACHE_KEY);
    if (stale) {
      const parsed = JSON.parse(stale);
      return c.json({ coins: parsed.coins, source: parsed.source, ts: parsed.ts, cached: true, stale: true });
    }
  } catch {}

  return c.json({ coins: [], source: null, ts: Date.now(), error: 'All sources failed' }, 502);
});

export default app;
