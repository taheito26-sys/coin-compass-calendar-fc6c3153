import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/audit/relationship/:id */
app.get('/relationship/:id', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ logs: [] });

  // Verify access
  const access = await c.env.DB.prepare(
    'SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)'
  ).bind(relId, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  // Get audit logs related to this relationship's entities
  const { results } = await c.env.DB.prepare(`
    SELECT al.*, mp.display_name AS actor_name
    FROM merchant_audit_logs al
    LEFT JOIN merchant_profiles mp ON mp.id = al.actor_merchant_id
    WHERE al.entity_id IN (
      SELECT id FROM merchant_deals WHERE relationship_id = ?
      UNION SELECT id FROM merchant_approvals WHERE relationship_id = ?
      UNION SELECT id FROM merchant_settlements WHERE relationship_id = ?
      UNION SELECT ?
    )
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(relId, relId, relId, relId, limit, offset).all();

  return c.json({ logs: results || [] });
});

/** GET /api/merchant/audit/activity */
app.get('/activity', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ logs: [] });

  const limit = parseInt(c.req.query('limit') || '50');

  const { results } = await c.env.DB.prepare(`
    SELECT al.*, mp.display_name AS actor_name
    FROM merchant_audit_logs al
    LEFT JOIN merchant_profiles mp ON mp.id = al.actor_merchant_id
    WHERE al.actor_user_id = ? OR al.actor_merchant_id = ?
    ORDER BY al.created_at DESC
    LIMIT ?
  `).bind(userId, merchant.id, limit).all();

  return c.json({ logs: results || [] });
});

export default app;
