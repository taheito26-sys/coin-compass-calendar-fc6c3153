import { Hono } from 'hono';
import type { Env, AssetRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/assets — public, no auth */
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM assets ORDER BY symbol'
  ).all<AssetRow>();

  return c.json({ assets: results || [] });
});

/**
 * POST /api/assets — authenticated, auto-create a missing asset
 * Body: { symbol: string, name?: string, coingecko_id?: string, binance_symbol?: string }
 * Returns existing asset if symbol already exists, or creates a new one.
 */
app.post('/', authMiddleware, async (c) => {
  const body = await c.req.json<{
    symbol?: string;
    name?: string;
    coingecko_id?: string;
    binance_symbol?: string;
  }>();

  const symbol = (body.symbol || '').trim().toUpperCase();
  if (!symbol || symbol.length > 20) {
    return c.json({ error: 'Invalid symbol' }, 400);
  }

  // Check if asset already exists
  const existing = await c.env.DB.prepare(
    'SELECT * FROM assets WHERE UPPER(symbol) = ? LIMIT 1'
  ).bind(symbol).first<AssetRow>();

  if (existing) {
    return c.json({ asset: existing, created: false });
  }

  // Auto-create with sensible defaults
  const name = (body.name || symbol).trim();
  const coingeckoId = body.coingecko_id || symbol.toLowerCase();
  const binanceSymbol = body.binance_symbol || `${symbol}USDT`;
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO assets (id, symbol, name, category, coingecko_id, binance_symbol, precision_qty, precision_price)
     VALUES (?, ?, ?, 'other', ?, ?, 8, 8)`
  ).bind(id, symbol, name, coingeckoId, binanceSymbol).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM assets WHERE id = ?'
  ).bind(id).first<AssetRow>();

  console.log(`[assets] Auto-created asset: ${symbol} (${id})`);
  return c.json({ asset: created, created: true }, 201);
});

export default app;
