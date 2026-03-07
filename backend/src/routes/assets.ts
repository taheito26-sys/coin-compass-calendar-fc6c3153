import { Hono } from 'hono';
import type { Env, AssetRow } from '../types';

const app = new Hono<{ Bindings: Env }>();

/** GET /api/assets — public, no auth */
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM assets ORDER BY symbol'
  ).all<AssetRow>();

  return c.json({ assets: results || [] });
});

export default app;
