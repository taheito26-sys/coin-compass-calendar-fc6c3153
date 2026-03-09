import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

const KV_KEY = 'fear-greed:latest';
const KV_TTL = 600; // 10 min

app.get('/', async (c) => {
  // Check cache
  try {
    const cached = await c.env.PRICE_KV.get(KV_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < KV_TTL * 1000) {
        return c.json({ ...parsed, cached: true });
      }
    }
  } catch {}

  // Fetch from Alternative.me
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=30&format=json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`FNG ${r.status}`);
    const json = await r.json() as any;
    const data = json.data || [];
    if (!data.length) throw new Error('FNG empty');

    const current = data[0];
    const payload = {
      value: parseInt(current.value),
      label: current.value_classification,
      timestamp: parseInt(current.timestamp) * 1000,
      history: data.slice(0, 30).map((d: any) => ({
        value: parseInt(d.value),
        label: d.value_classification,
        ts: parseInt(d.timestamp) * 1000,
      })),
      ts: Date.now(),
    };

    c.executionCtx.waitUntil(
      c.env.PRICE_KV.put(KV_KEY, JSON.stringify(payload), { expirationTtl: KV_TTL })
    );

    return c.json({ ...payload, cached: false });
  } catch (err: any) {
    console.warn(`[fear-greed] Failed: ${err?.message}`);
    // Try stale cache
    try {
      const stale = await c.env.PRICE_KV.get(KV_KEY);
      if (stale) return c.json({ ...JSON.parse(stale), cached: true, stale: true });
    } catch {}
    return c.json({ value: null, label: null, error: 'Failed to fetch' }, 502);
  }
});

export default app;
