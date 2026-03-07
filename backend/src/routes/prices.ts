import { Hono } from 'hono';
import type { Env, PriceSnapshot, MiniSnapshot } from '../types';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/prices — public, reads from KV */
app.get('/', async (c) => {
  const raw = await c.env.PRICE_KV.get('prices:latest');
  if (!raw) {
    return c.json({ prices: null, stale: true });
  }
  const snapshot: PriceSnapshot = JSON.parse(raw);
  const ageMs = Date.now() - snapshot.ts;
  return c.json({ prices: snapshot.prices, ts: snapshot.ts, ageMs, stale: ageMs > 600_000 });
});

/** GET /api/prices/history — public, 24h rolling history from KV */
app.get('/history', async (c) => {
  const raw = await c.env.PRICE_KV.get('prices:history');
  const history: MiniSnapshot[] = raw ? JSON.parse(raw) : [];
  return c.json({ history, count: history.length });
});

export default app;
