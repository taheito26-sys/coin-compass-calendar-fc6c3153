import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

/** GET /api/merchant/notifications */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '50');
  const unreadOnly = c.req.query('unread') === '1';

  let query = `SELECT * FROM merchant_notifications WHERE user_id = ?`;
  if (unreadOnly) query += ` AND read_at IS NULL`;
  query += ` ORDER BY created_at DESC LIMIT ?`;

  const { results } = await c.env.DB.prepare(query).bind(userId, limit).all();
  return c.json({ notifications: results || [] });
});

/** GET /api/merchant/notifications/count */
app.get('/count', async (c) => {
  const userId = c.get('userId');
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM merchant_notifications WHERE user_id = ? AND read_at IS NULL'
  ).bind(userId).first<any>();
  return c.json({ unread: row?.cnt || 0 });
});

/** POST /api/merchant/notifications/:id/read */
app.post('/:id/read', async (c) => {
  const userId = c.get('userId');
  const nId = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE merchant_notifications SET read_at = ? WHERE id = ? AND user_id = ?"
  ).bind(new Date().toISOString(), nId, userId).run();
  return c.json({ ok: true });
});

/** POST /api/merchant/notifications/read-all */
app.post('/read-all', async (c) => {
  const userId = c.get('userId');
  await c.env.DB.prepare(
    "UPDATE merchant_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL"
  ).bind(new Date().toISOString(), userId).run();
  return c.json({ ok: true });
});

export default app;
