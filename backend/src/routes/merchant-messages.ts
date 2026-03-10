import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/relationships/:id/messages */
app.get('/:relId/messages', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('relId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ messages: [] });

  // Verify access
  const access = await c.env.DB.prepare(
    'SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)'
  ).bind(relId, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const { results } = await c.env.DB.prepare(`
    SELECT m.*, mp.display_name AS sender_name, mp.nickname AS sender_nickname
    FROM merchant_messages m
    JOIN merchant_profiles mp ON mp.id = m.sender_merchant_id
    WHERE m.relationship_id = ? AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(relId, limit, offset).all();

  return c.json({ messages: (results || []).reverse() });
});

/** POST /api/merchant/relationships/:id/messages */
app.post('/:relId/messages', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('relId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const access = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(relId, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ body: string; message_type?: string }>();
  if (!body.body?.trim()) return c.json({ error: 'Message body required' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, relId, userId, merchant.id, body.message_type || 'text', body.body.trim(), now).run();

  // Notify counterparty
  const rel = await c.env.DB.prepare('SELECT merchant_a_id, merchant_b_id FROM merchant_relationships WHERE id = ?').bind(relId).first<any>();
  if (rel) {
    const counterpartyId = rel.merchant_a_id === merchant.id ? rel.merchant_b_id : rel.merchant_a_id;
    const cp = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?').bind(counterpartyId).first<any>();
    if (cp) {
      await c.env.DB.prepare(`
        INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
        VALUES (?, ?, ?, 'message', ?, ?, 'relationship', ?, ?)
      `).bind(crypto.randomUUID(), cp.owner_user_id, counterpartyId,
        `New message from ${merchant.display_name}`, body.body.trim().slice(0, 100),
        relId, now).run();
    }
  }

  const msg = await c.env.DB.prepare('SELECT * FROM merchant_messages WHERE id = ?').bind(id).first();
  return c.json({ message: msg }, 201);
});

/** POST /api/merchant/messages/:id/read */
app.post('/mark-read/:id', async (c) => {
  const userId = c.get('userId');
  const msgId = c.req.param('id');

  const msg = await c.env.DB.prepare('SELECT * FROM merchant_messages WHERE id = ?').bind(msgId).first<any>();
  if (!msg) return c.json({ error: 'Not found' }, 404);

  const readBy = msg.read_by ? JSON.parse(msg.read_by) : [];
  if (!readBy.includes(userId)) {
    readBy.push(userId);
    await c.env.DB.prepare('UPDATE merchant_messages SET read_by = ? WHERE id = ?')
      .bind(JSON.stringify(readBy), msgId).run();
  }

  return c.json({ ok: true });
});

export default app;
