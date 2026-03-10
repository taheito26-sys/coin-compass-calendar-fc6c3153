import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/relationships */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ relationships: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT r.*,
      pa.display_name AS a_display_name, pa.nickname AS a_nickname, pa.merchant_id AS a_merchant_code,
      pb.display_name AS b_display_name, pb.nickname AS b_nickname, pb.merchant_id AS b_merchant_code,
      mr.role AS my_role
    FROM merchant_relationships r
    JOIN merchant_profiles pa ON pa.id = r.merchant_a_id
    JOIN merchant_profiles pb ON pb.id = r.merchant_b_id
    LEFT JOIN merchant_roles mr ON mr.relationship_id = r.id AND mr.merchant_id = ?
    WHERE (r.merchant_a_id = ? OR r.merchant_b_id = ?)
    ORDER BY r.created_at DESC
  `).bind(merchant.id, merchant.id, merchant.id).all();

  return c.json({ relationships: results || [] });
});

/** GET /api/merchant/relationships/:id */
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const rel = await c.env.DB.prepare(`
    SELECT r.*,
      pa.display_name AS a_display_name, pa.nickname AS a_nickname, pa.merchant_id AS a_merchant_code,
      pb.display_name AS b_display_name, pb.nickname AS b_nickname, pb.merchant_id AS b_merchant_code
    FROM merchant_relationships r
    JOIN merchant_profiles pa ON pa.id = r.merchant_a_id
    JOIN merchant_profiles pb ON pb.id = r.merchant_b_id
    WHERE r.id = ? AND (r.merchant_a_id = ? OR r.merchant_b_id = ?)
  `).bind(relId, merchant.id, merchant.id).first();
  if (!rel) return c.json({ error: 'Not found' }, 404);

  // Get roles
  const { results: roles } = await c.env.DB.prepare(
    'SELECT * FROM merchant_roles WHERE relationship_id = ?'
  ).bind(relId).all();

  // Get deal summary
  const dealSummary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total_deals,
      SUM(CASE WHEN status IN ('active','due') THEN amount ELSE 0 END) AS active_exposure,
      SUM(CASE WHEN status = 'settled' OR status = 'closed' THEN COALESCE(realized_pnl, 0) ELSE 0 END) AS realized_profit
    FROM merchant_deals WHERE relationship_id = ?
  `).bind(relId).first<any>();

  // Pending approvals count
  const pendingApprovals = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM merchant_approvals WHERE relationship_id = ? AND status = 'pending'"
  ).bind(relId).first<any>();

  return c.json({
    relationship: rel,
    roles: roles || [],
    summary: {
      totalDeals: dealSummary?.total_deals || 0,
      activeExposure: dealSummary?.active_exposure || 0,
      realizedProfit: dealSummary?.realized_profit || 0,
      pendingApprovals: pendingApprovals?.cnt || 0,
    },
  });
});

/** PATCH /api/merchant/relationships/:id/settings */
app.patch('/:id/settings', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ relationship_type?: string; shared_fields?: string[]; approval_policy?: Record<string, boolean> }>();
  const now = new Date().toISOString();

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.relationship_type) { sets.push('relationship_type = ?'); vals.push(body.relationship_type); }
  if (body.shared_fields) { sets.push('shared_fields = ?'); vals.push(JSON.stringify(body.shared_fields)); }
  if (body.approval_policy) { sets.push('approval_policy = ?'); vals.push(JSON.stringify(body.approval_policy)); }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  sets.push('updated_at = ?'); vals.push(now); vals.push(relId); vals.push(merchant.id); vals.push(merchant.id);

  await c.env.DB.prepare(`UPDATE merchant_relationships SET ${sets.join(', ')} WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)`).bind(...vals).run();
  return c.json({ ok: true });
});

/** POST /api/merchant/relationships/:id/suspend */
app.post('/:id/suspend', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE merchant_relationships SET status = 'suspended', updated_at = ? WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)"
  ).bind(now, relId, merchant.id, merchant.id).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'relationship', ?, 'suspend', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, relId, now).run();

  return c.json({ ok: true });
});

/** POST /api/merchant/relationships/:id/terminate */
app.post('/:id/terminate', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE merchant_relationships SET status = 'terminated', updated_at = ? WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)"
  ).bind(now, relId, merchant.id, merchant.id).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'relationship', ?, 'terminate', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, relId, now).run();

  return c.json({ ok: true });
});

export default app;
