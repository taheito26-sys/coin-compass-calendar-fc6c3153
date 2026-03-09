import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// All routes require auth
app.use('*', authMiddleware);

// ─── Helpers ──────────────────────────────────────────────

async function ensureTable(db: D1Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS exchange_connections (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      exchange TEXT NOT NULL,
      api_key TEXT NOT NULL,
      api_secret TEXT NOT NULL,
      passphrase TEXT,
      label TEXT,
      status TEXT DEFAULT 'connected',
      last_sync TEXT,
      sync_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, exchange)
    )
  `);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Normalized trade type ────────────────────────────────

interface NormalizedTrade {
  exchange: string;
  symbol: string;        // e.g. "BTC"
  quoteAsset: string;    // e.g. "USDT"
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fee: number;
  feeCurrency: string;
  timestamp: number;     // ms
  tradeId: string;
  orderId: string;
}

// ─── Exchange Fetchers ────────────────────────────────────

// ── BINANCE ──
async function fetchBinanceTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const baseUrl = 'https://api.binance.com';
  const trades: NormalizedTrade[] = [];

  // 1. Get account to find which assets have been traded
  const ts1 = Date.now();
  const q1 = `timestamp=${ts1}`;
  const sig1 = await hmacSha256Hex(apiSecret, q1);
  const accRes = await fetch(`${baseUrl}/api/v3/account?${q1}&signature=${sig1}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!accRes.ok) {
    const err = await accRes.json().catch(() => ({}));
    throw new Error(`Binance account error ${accRes.status}: ${(err as any)?.msg || accRes.statusText}`);
  }
  const acc = await accRes.json() as { balances: { asset: string; free: string; locked: string }[] };

  // Find assets with any balance history (we'll try USDT pairs for common ones)
  const symbols = new Set<string>();
  const topSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'AVAX', 'LINK', 'MATIC',
    'DOGE', 'SHIB', 'UNI', 'LTC', 'ATOM', 'FIL', 'NEAR', 'APT', 'OP', 'ARB',
    'SUI', 'SEI', 'TIA', 'INJ', 'FET', 'RNDR', 'WLD', 'PEPE', 'BONK', 'QNT'];

  for (const b of acc.balances) {
    if (parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) {
      if (b.asset !== 'USDT' && b.asset !== 'USD' && b.asset !== 'BUSD') {
        symbols.add(b.asset);
      }
    }
  }
  // Also try top symbols
  for (const s of topSymbols) symbols.add(s);

  // 2. Fetch trades for each symbol (rate limited)
  let fetched = 0;
  for (const sym of symbols) {
    if (fetched >= 30) break; // Max 30 pairs to avoid rate limits
    const pair = `${sym}USDT`;
    const ts = Date.now();
    const qs = `symbol=${pair}&limit=1000&timestamp=${ts}`;
    const sig = await hmacSha256Hex(apiSecret, qs);

    try {
      const res = await fetch(`${baseUrl}/api/v3/myTrades?${qs}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 400) continue; // Invalid symbol
      if (!res.ok) continue;

      const data = await res.json() as any[];
      for (const t of data) {
        trades.push({
          exchange: 'binance',
          symbol: sym,
          quoteAsset: 'USDT',
          side: t.isBuyer ? 'buy' : 'sell',
          qty: parseFloat(t.qty),
          price: parseFloat(t.price),
          fee: parseFloat(t.commission),
          feeCurrency: t.commissionAsset || 'USDT',
          timestamp: t.time,
          tradeId: String(t.id),
          orderId: String(t.orderId),
        });
      }
      fetched++;
      // Small delay between requests
      if (fetched < 30) await new Promise(r => setTimeout(r, 100));
    } catch { continue; }
  }

  return trades;
}

// ── BYBIT ──
async function fetchBybitTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const baseUrl = 'https://api.bybit.com';
  const trades: NormalizedTrade[] = [];
  const recvWindow = '20000';

  async function bybitGet(path: string, params: Record<string, string>): Promise<any> {
    const ts = String(Date.now());
    const qs = new URLSearchParams(params).toString();
    const preSign = ts + apiKey + recvWindow + qs;
    const sign = await hmacSha256Hex(apiSecret, preSign);

    const res = await fetch(`${baseUrl}${path}?${qs}`, {
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': ts,
        'X-BAPI-SIGN': sign,
        'X-BAPI-RECV-WINDOW': recvWindow,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Bybit ${res.status}`);
    const data = await res.json() as any;
    if (data.retCode !== 0) throw new Error(`Bybit error: ${data.retMsg}`);
    return data.result;
  }

  // Fetch execution history (spot trades)
  let cursor = '';
  let pages = 0;
  do {
    const params: Record<string, string> = { category: 'spot', limit: '100' };
    if (cursor) params.cursor = cursor;

    const result = await bybitGet('/v5/execution/list', params);
    const list = result?.list || [];

    for (const t of list) {
      const sym = (t.symbol || '').replace('USDT', '');
      trades.push({
        exchange: 'bybit',
        symbol: sym,
        quoteAsset: 'USDT',
        side: (t.side || '').toLowerCase() as 'buy' | 'sell',
        qty: parseFloat(t.execQty) || 0,
        price: parseFloat(t.execPrice) || 0,
        fee: Math.abs(parseFloat(t.execFee) || 0),
        feeCurrency: t.feeCurrency || 'USDT',
        timestamp: parseInt(t.execTime) || Date.now(),
        tradeId: t.execId || '',
        orderId: t.orderId || '',
      });
    }

    cursor = result?.nextPageCursor || '';
    pages++;
    if (pages > 10) break; // Safety limit
  } while (cursor);

  return trades;
}

// ── OKX ──
async function fetchOkxTrades(apiKey: string, apiSecret: string, passphrase: string): Promise<NormalizedTrade[]> {
  const baseUrl = 'https://www.okx.com';
  const trades: NormalizedTrade[] = [];

  async function okxGet(path: string, params: Record<string, string> = {}): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const fullPath = qs ? `${path}?${qs}` : path;
    const ts = new Date().toISOString();
    const preSign = ts + 'GET' + fullPath;
    const sign = await hmacSha256Base64(apiSecret, preSign);

    const res = await fetch(`${baseUrl}${fullPath}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OKX ${res.status}`);
    const data = await res.json() as any;
    if (data.code !== '0') throw new Error(`OKX error: ${data.msg}`);
    return data.data || [];
  }

  // Fetch fills history for spot
  let after = '';
  let pages = 0;
  do {
    const params: Record<string, string> = { instType: 'SPOT', limit: '100' };
    if (after) params.after = after;

    const fills = await okxGet('/api/v5/trade/fills-history', params);
    if (!fills.length) break;

    for (const f of fills) {
      const instId = f.instId || ''; // e.g. "BTC-USDT"
      const [sym, quote] = instId.split('-');
      trades.push({
        exchange: 'okx',
        symbol: sym || '',
        quoteAsset: quote || 'USDT',
        side: (f.side || '').toLowerCase() as 'buy' | 'sell',
        qty: parseFloat(f.fillSz) || 0,
        price: parseFloat(f.fillPx) || 0,
        fee: Math.abs(parseFloat(f.fee) || 0),
        feeCurrency: f.feeCcy || 'USDT',
        timestamp: parseInt(f.ts) || Date.now(),
        tradeId: f.tradeId || '',
        orderId: f.ordId || '',
      });
    }

    after = fills[fills.length - 1]?.billId || '';
    pages++;
    if (pages > 10) break;
  } while (after);

  return trades;
}

// ── GATE.IO ──
async function fetchGateTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const baseUrl = 'https://api.gateio.ws';
  const trades: NormalizedTrade[] = [];

  async function gateGet(path: string, params: Record<string, string> = {}): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const fullPath = qs ? `${path}?${qs}` : path;
    const ts = String(Math.floor(Date.now() / 1000));
    const bodyHash = await sha256Hex('');
    const preSign = `GET\n${fullPath}\n${qs}\n${bodyHash}\n${ts}`;
    const sign = await hmacSha512Hex(apiSecret, preSign);

    const res = await fetch(`${baseUrl}${fullPath}`, {
      headers: {
        'KEY': apiKey,
        'SIGN': sign,
        'Timestamp': ts,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Gate.io ${res.status}`);
    return res.json();
  }

  // Fetch spot trades
  const data = await gateGet('/api/v4/spot/my_trades', { limit: '1000' });
  if (!Array.isArray(data)) return trades;

  for (const t of data) {
    const pair = (t.currency_pair || '').split('_');
    trades.push({
      exchange: 'gate',
      symbol: pair[0] || '',
      quoteAsset: pair[1] || 'USDT',
      side: (t.side || '').toLowerCase() as 'buy' | 'sell',
      qty: parseFloat(t.amount) || 0,
      price: parseFloat(t.price) || 0,
      fee: Math.abs(parseFloat(t.fee) || 0),
      feeCurrency: t.fee_currency || 'USDT',
      timestamp: (parseInt(t.create_time) || 0) * 1000,
      tradeId: String(t.id || ''),
      orderId: String(t.order_id || ''),
    });
  }

  return trades;
}

// ── COINBASE ──
async function fetchCoinbaseTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const baseUrl = 'https://api.coinbase.com';
  const trades: NormalizedTrade[] = [];

  async function cbGet(path: string): Promise<any> {
    const ts = String(Math.floor(Date.now() / 1000));
    const preSign = ts + 'GET' + path;
    const sign = await hmacSha256Hex(apiSecret, preSign);

    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        'CB-ACCESS-KEY': apiKey,
        'CB-ACCESS-SIGN': sign,
        'CB-ACCESS-TIMESTAMP': ts,
        'CB-VERSION': '2024-01-01',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Coinbase ${res.status}`);
    return res.json();
  }

  // Get accounts, then fills for each
  try {
    const { data: accounts } = await cbGet('/v2/accounts?limit=100');
    for (const acc of (accounts || []).slice(0, 20)) {
      if (!acc.id || !acc.currency) continue;
      try {
        const { data: buySells } = await cbGet(`/v2/accounts/${acc.id}/buys?limit=100`);
        for (const t of (buySells || [])) {
          trades.push({
            exchange: 'coinbase',
            symbol: acc.currency?.code || '',
            quoteAsset: t.total?.currency || 'USD',
            side: 'buy',
            qty: parseFloat(t.amount?.amount) || 0,
            price: parseFloat(t.unit_price?.amount) || 0,
            fee: parseFloat(t.fees?.[0]?.amount?.amount) || 0,
            feeCurrency: t.fees?.[0]?.amount?.currency || 'USD',
            timestamp: new Date(t.created_at).getTime() || Date.now(),
            tradeId: t.id || '',
            orderId: t.id || '',
          });
        }
        const { data: sells } = await cbGet(`/v2/accounts/${acc.id}/sells?limit=100`);
        for (const t of (sells || [])) {
          trades.push({
            exchange: 'coinbase',
            symbol: acc.currency?.code || '',
            quoteAsset: t.total?.currency || 'USD',
            side: 'sell',
            qty: parseFloat(t.amount?.amount) || 0,
            price: parseFloat(t.unit_price?.amount) || 0,
            fee: parseFloat(t.fees?.[0]?.amount?.amount) || 0,
            feeCurrency: t.fees?.[0]?.amount?.currency || 'USD',
            timestamp: new Date(t.created_at).getTime() || Date.now(),
            tradeId: t.id || '',
            orderId: t.id || '',
          });
        }
        await new Promise(r => setTimeout(r, 200));
      } catch { continue; }
    }
  } catch (err: any) {
    throw new Error(`Coinbase: ${err?.message}`);
  }

  return trades;
}

// ── KRAKEN ──
async function fetchKrakenTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const baseUrl = 'https://api.kraken.com';
  const trades: NormalizedTrade[] = [];

  const nonce = String(Date.now() * 1000);
  const body = `nonce=${nonce}`;
  const path = '/0/private/TradesHistory';

  // Kraken uses SHA256(nonce + body) then HMAC-SHA512(base64decode(secret), path + sha256)
  const sha256Hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce + body));
  const pathBytes = new TextEncoder().encode(path);
  const combined = new Uint8Array(pathBytes.length + sha256Hash.byteLength);
  combined.set(pathBytes);
  combined.set(new Uint8Array(sha256Hash), pathBytes.length);

  // Decode base64 secret
  const secretBytes = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
  const hmacKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, combined);
  const sign = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'API-Key': apiKey,
      'API-Sign': sign,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const data = await res.json() as any;
  if (data.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`);

  const tradesMap = data.result?.trades || {};
  for (const [id, t] of Object.entries(tradesMap) as any) {
    const pair = t.pair || '';
    // Kraken pairs like XXBTZUSD -> BTC/USD
    const sym = pair.replace(/^X/, '').replace(/Z?USD$/, '').replace(/Z?USDT$/, '');
    trades.push({
      exchange: 'kraken',
      symbol: sym === 'XBT' ? 'BTC' : sym,
      quoteAsset: pair.includes('USDT') ? 'USDT' : 'USD',
      side: t.type === 'buy' ? 'buy' : 'sell',
      qty: parseFloat(t.vol) || 0,
      price: parseFloat(t.price) || 0,
      fee: parseFloat(t.fee) || 0,
      feeCurrency: 'USD',
      timestamp: (parseFloat(t.time) || 0) * 1000,
      tradeId: id,
      orderId: t.ordertxid || '',
    });
  }

  return trades;
}

const EXCHANGE_FETCHERS: Record<string, (key: string, secret: string, passphrase?: string) => Promise<NormalizedTrade[]>> = {
  binance: fetchBinanceTrades,
  bybit: fetchBybitTrades,
  okx: (k, s, p) => fetchOkxTrades(k, s, p || ''),
  gate: fetchGateTrades,
  coinbase: fetchCoinbaseTrades,
  kraken: fetchKrakenTrades,
};

// ─── CRUD: Exchange Connections ───────────────────────────

// GET /api/exchange-sync — List connections
app.get('/', async (c) => {
  const userId = (c as any).get?.('userId') || c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  await ensureTable(c.env.DB);

  const rows = await c.env.DB.prepare(
    'SELECT id, exchange, label, status, last_sync, sync_count, created_at FROM exchange_connections WHERE user_id = ?'
  ).bind(userId).all();

  return c.json({ connections: rows.results || [] });
});

// POST /api/exchange-sync — Save connection
app.post('/', async (c) => {
  const userId = (c as any).get?.('userId') || c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  await ensureTable(c.env.DB);

  const body = await c.req.json() as any;
  const { exchange, api_key, api_secret, passphrase, label } = body;

  if (!exchange || !api_key || !api_secret) {
    return c.json({ error: 'exchange, api_key, api_secret required' }, 400);
  }

  // Upsert
  await c.env.DB.prepare(`
    INSERT INTO exchange_connections (user_id, exchange, api_key, api_secret, passphrase, label)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, exchange)
    DO UPDATE SET api_key=excluded.api_key, api_secret=excluded.api_secret, passphrase=excluded.passphrase, label=excluded.label, status='connected'
  `).bind(userId, exchange, api_key, api_secret, passphrase || null, label || null).run();

  return c.json({ ok: true });
});

// DELETE /api/exchange-sync/:exchange — Remove connection
app.delete('/:exchange', async (c) => {
  const userId = (c as any).get?.('userId') || c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  await ensureTable(c.env.DB);
  const exchange = c.req.param('exchange');

  await c.env.DB.prepare(
    'DELETE FROM exchange_connections WHERE user_id = ? AND exchange = ?'
  ).bind(userId, exchange).run();

  return c.json({ ok: true });
});

// POST /api/exchange-sync/test/:exchange — Test connection
app.post('/test/:exchange', async (c) => {
  const userId = (c as any).get?.('userId') || c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  await ensureTable(c.env.DB);
  const exchange = c.req.param('exchange');

  const conn = await c.env.DB.prepare(
    'SELECT * FROM exchange_connections WHERE user_id = ? AND exchange = ?'
  ).bind(userId, exchange).first() as any;

  if (!conn) return c.json({ error: 'Connection not found' }, 404);

  const fetcher = EXCHANGE_FETCHERS[exchange];
  if (!fetcher) return c.json({ error: `Exchange ${exchange} not supported` }, 400);

  try {
    // Just try to fetch — if it throws, credentials are wrong
    const trades = await fetcher(conn.api_key, conn.api_secret, conn.passphrase);
    return c.json({ ok: true, tradeCount: trades.length, message: `Found ${trades.length} trades` });
  } catch (err: any) {
    // Update status to error
    await c.env.DB.prepare(
      'UPDATE exchange_connections SET status = ? WHERE user_id = ? AND exchange = ?'
    ).bind('error', userId, exchange).run();
    return c.json({ ok: false, error: err?.message || 'Connection test failed' }, 400);
  }
});

// POST /api/exchange-sync/sync/:exchange — Sync trades
app.post('/sync/:exchange', async (c) => {
  const userId = (c as any).get?.('userId') || c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  await ensureTable(c.env.DB);
  const exchange = c.req.param('exchange');

  const conn = await c.env.DB.prepare(
    'SELECT * FROM exchange_connections WHERE user_id = ? AND exchange = ?'
  ).bind(userId, exchange).first() as any;

  if (!conn) return c.json({ error: 'Connection not found' }, 404);

  const fetcher = EXCHANGE_FETCHERS[exchange];
  if (!fetcher) return c.json({ error: `Exchange ${exchange} not supported` }, 400);

  try {
    const trades = await fetcher(conn.api_key, conn.api_secret, conn.passphrase);
    console.log(`[exchange-sync] ${exchange}: fetched ${trades.length} trades`);

    if (trades.length === 0) {
      await c.env.DB.prepare(
        'UPDATE exchange_connections SET last_sync = datetime("now"), status = "connected" WHERE user_id = ? AND exchange = ?'
      ).bind(userId, exchange).run();
      return c.json({ ok: true, synced: 0, skipped: 0, message: 'No trades found' });
    }

    // Resolve assets and insert trades
    let synced = 0, skipped = 0;
    const exchangeLabel = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', gate: 'Gate.io', coinbase: 'Coinbase', kraken: 'Kraken' }[exchange] || exchange;

    for (const trade of trades) {
      // Find or skip asset
      const asset = await c.env.DB.prepare(
        'SELECT id FROM assets WHERE UPPER(symbol) = UPPER(?)'
      ).bind(trade.symbol).first() as any;

      if (!asset) {
        // Try to create asset
        try {
          await c.env.DB.prepare(
            'INSERT INTO assets (symbol, name, category) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
          ).bind(trade.symbol.toUpperCase(), trade.symbol.toUpperCase(), 'crypto').run();
        } catch { }
        const created = await c.env.DB.prepare(
          'SELECT id FROM assets WHERE UPPER(symbol) = UPPER(?)'
        ).bind(trade.symbol).first() as any;
        if (!created) { skipped++; continue; }
      }

      const assetId = asset?.id || (await c.env.DB.prepare(
        'SELECT id FROM assets WHERE UPPER(symbol) = UPPER(?)'
      ).bind(trade.symbol).first() as any)?.id;

      if (!assetId) { skipped++; continue; }

      const externalId = `${exchange}:${trade.tradeId}`;

      // Check for duplicate
      const existing = await c.env.DB.prepare(
        'SELECT id FROM transactions WHERE user_id = ? AND external_id = ?'
      ).bind(userId, externalId).first();

      if (existing) { skipped++; continue; }

      // Insert
      await c.env.DB.prepare(`
        INSERT INTO transactions (user_id, asset_id, timestamp, type, qty, unit_price, fee_amount, fee_currency, venue, note, source, external_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId, assetId, new Date(trade.timestamp).toISOString(),
        trade.side, trade.qty, trade.price,
        trade.fee, trade.feeCurrency,
        exchangeLabel, `Synced from ${exchangeLabel}`, 'api_sync', externalId,
      ).run();
      synced++;
    }

    // Update connection
    await c.env.DB.prepare(
      'UPDATE exchange_connections SET last_sync = datetime("now"), sync_count = sync_count + ?, status = "connected" WHERE user_id = ? AND exchange = ?'
    ).bind(synced, userId, exchange).run();

    console.log(`[exchange-sync] ${exchange}: synced ${synced}, skipped ${skipped}`);
    return c.json({ ok: true, synced, skipped, total: trades.length });
  } catch (err: any) {
    console.error(`[exchange-sync] ${exchange} failed:`, err?.message);
    await c.env.DB.prepare(
      'UPDATE exchange_connections SET status = "error" WHERE user_id = ? AND exchange = ?'
    ).bind(userId, exchange).run();
    return c.json({ ok: false, error: err?.message || 'Sync failed' }, 500);
  }
});

export default app;
