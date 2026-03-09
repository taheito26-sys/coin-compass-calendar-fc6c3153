import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.use('/*', authMiddleware);

/** GET /api/preferences — all preferences for authenticated user */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    'SELECT key, value FROM user_preferences WHERE user_id = ?'
  ).bind(userId).all<{ key: string; value: string }>();

  const prefs: Record<string, string> = {};
  for (const row of results || []) {
    prefs[row.key] = row.value;
  }
  return c.json({ preferences: prefs });
});

/** PUT /api/preferences — upsert one or more preferences */
app.put('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<Record<string, string>>();

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Body must be a JSON object of key-value pairs' }, 400);
  }

  const entries = Object.entries(body).filter(
    ([k, v]) => typeof k === 'string' && k.length > 0 && typeof v === 'string'
  );

  if (entries.length === 0) {
    return c.json({ error: 'No valid preferences provided' }, 400);
  }

  for (const [key, value] of entries) {
    await c.env.DB.prepare(`
      INSERT INTO user_preferences (id, user_id, key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
    `).bind(crypto.randomUUID(), userId, key, value).run();
  }

  return c.json({ ok: true, updated: entries.length });
});

export default app;
