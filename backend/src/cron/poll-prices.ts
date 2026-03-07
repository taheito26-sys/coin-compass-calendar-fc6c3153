import type { Env, PriceEntry, PriceSnapshot, MiniSnapshot, AssetRow } from '../types';

const BINANCE_TICKER = 'https://api.binance.com/api/v3/ticker/24hr';

/**
 * Cron handler — polls Binance ticker for all assets with binance_symbol,
 * stores latest prices in KV. Same pattern as ref repo's pollAndStore().
 */
export async function pollPrices(env: Env): Promise<{ updated: number }> {
  // 1. Get assets with Binance symbols from D1
  const { results } = await env.DB.prepare(
    'SELECT id, symbol, binance_symbol FROM assets WHERE binance_symbol IS NOT NULL'
  ).all<Pick<AssetRow, 'id' | 'symbol' | 'binance_symbol'>>();

  const assets = results || [];
  if (assets.length === 0) return { updated: 0 };

  // 2. Fetch all tickers from Binance (single request)
  const symbols = assets.map(a => a.binance_symbol!);
  const url = `${BINANCE_TICKER}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);

  const tickers: Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
    volume: string;
    quoteVolume: string;
  }> = await res.json();

  // Build lookup: binance_symbol -> ticker
  const tickerMap = new Map<string, typeof tickers[0]>();
  for (const t of tickers) tickerMap.set(t.symbol, t);

  // 3. Build price entries
  const prices: Record<string, PriceEntry> = {};
  let updated = 0;
  const now = Date.now();

  for (const asset of assets) {
    const ticker = tickerMap.get(asset.binance_symbol!);
    if (!ticker) continue;

    prices[asset.id] = {
      price: parseFloat(ticker.lastPrice) || 0,
      change_1h: null, // Binance 24hr ticker doesn't have 1h
      change_24h: parseFloat(ticker.priceChangePercent) || null,
      change_7d: null, // Not available from this endpoint
      market_cap: null,
      volume_24h: parseFloat(ticker.quoteVolume) || null,
      ts: now,
    };
    updated++;
  }

  // 4. Store latest snapshot in KV (TTL 10 min)
  const snapshot: PriceSnapshot = { prices, ts: now };
  await env.PRICE_KV.put('prices:latest', JSON.stringify(snapshot), {
    expirationTtl: 600, // 10 min
  });

  // 5. Append to rolling 24h history (720 points @ 2min, TTL 25h)
  let history: MiniSnapshot[] = [];
  try {
    const raw = await env.PRICE_KV.get('prices:history');
    if (raw) history = JSON.parse(raw);
    if (!Array.isArray(history)) history = [];
  } catch {}

  const miniPrices: Record<string, number> = {};
  for (const [id, entry] of Object.entries(prices)) {
    miniPrices[id] = entry.price;
  }
  history.push({ ts: now, prices: miniPrices });
  if (history.length > 720) history = history.slice(-720);

  await env.PRICE_KV.put('prices:history', JSON.stringify(history), {
    expirationTtl: 90000, // 25h
  });

  return { updated };
}
