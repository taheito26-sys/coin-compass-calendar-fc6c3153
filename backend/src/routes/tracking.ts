import { Hono } from 'hono';
import type { Env, TrackingPreferenceRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.use('/*', authMiddleware);

/** GET /api/tracking-preferences?asset_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const assetId = c.req.query('asset_id') || '__global__';

  const row = await c.env.DB.prepare(
    'SELECT * FROM tracking_preferences WHERE user_id = ? AND asset_id = ?'
  ).bind(userId, assetId).first<TrackingPreferenceRow>();

  return c.json({ preference: row || null });
});

/** PUT /api/tracking-preferences */
app.put('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ tracking_mode: string; asset_id?: string }>();

  if (!body.tracking_mode || !['fifo', 'dca'].includes(body.tracking_mode)) {
    return c.json({ error: 'tracking_mode must be "fifo" or "dca"' }, 400);
  }

  const assetId = body.asset_id || '__global__';
  const id = crypto.randomUUID();

  // Upsert via INSERT OR REPLACE (UNIQUE constraint on user_id, asset_id)
  await c.env.DB.prepare(`
    INSERT INTO tracking_preferences (id, user_id, asset_id, tracking_mode)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, asset_id) DO UPDATE SET tracking_mode = excluded.tracking_mode
  `).bind(id, userId, assetId, body.tracking_mode).run();

  const row = await c.env.DB.prepare(
    'SELECT * FROM tracking_preferences WHERE user_id = ? AND asset_id = ?'
  ).bind(userId, assetId).first<TrackingPreferenceRow>();

  return c.json({ preference: row });
});

export default app;
