import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

async function verifyRelationshipAccess(db: D1Database, relId: string, merchantId: string) {
  return db.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(relId, merchantId, merchantId).first();
}

/** GET /api/merchant/deals?relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ deals: [] });

  const relId = c.req.query('relationship_id');
  let query: string;
  let bindings: unknown[];

  if (relId) {
    query = `SELECT d.*, mr.merchant_a_id, mr.merchant_b_id
      FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.relationship_id = ? AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    bindings = [relId, merchant.id, merchant.id];
  } else {
    query = `SELECT d.*, mr.merchant_a_id, mr.merchant_b_id
      FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    bindings = [merchant.id, merchant.id];
  }

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ deals: results || [] });
});

/** POST /api/merchant/deals — create deal */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    relationship_id: string;
    deal_type: string;
    title: string;
    amount: number;
    currency?: string;
    issue_date?: string;
    due_date?: string;
    expected_return?: number;
    metadata?: Record<string, unknown>;
  }>();

  if (!body.relationship_id || !body.deal_type || !body.title || body.amount == null) {
    return c.json({ error: 'relationship_id, deal_type, title, amount required' }, 400);
  }

  const access = await verifyRelationshipAccess(c.env.DB, body.relationship_id, merchant.id);
  if (!access) return c.json({ error: 'Relationship not found or inactive' }, 403);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, metadata, issue_date, due_date, expected_return, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.relationship_id, body.deal_type, body.title, body.amount,
    body.currency || 'USDT', body.metadata ? JSON.stringify(body.metadata) : null,
    body.issue_date || null, body.due_date || null, body.expected_return ?? null,
    merchant.id, now, now
  ).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'create', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, id, JSON.stringify({ deal_type: body.deal_type, amount: body.amount }), now).run();

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(id).first();
  return c.json({ deal }, 201);
});

/** PATCH /api/merchant/deals/:id */
app.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Not found' }, 404);

  const access = await verifyRelationshipAccess(c.env.DB, deal.relationship_id, merchant.id);
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<Partial<{
    title: string; amount: number; status: string; due_date: string;
    expected_return: number; realized_pnl: number; close_date: string; metadata: Record<string, unknown>;
  }>>();

  const EDITABLE: Record<string, (v: unknown) => unknown> = {
    title: v => String(v), amount: v => Number(v), status: v => String(v),
    due_date: v => v == null ? null : String(v), expected_return: v => v == null ? null : Number(v),
    realized_pnl: v => v == null ? null : Number(v), close_date: v => v == null ? null : String(v),
    metadata: v => v == null ? null : JSON.stringify(v),
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, sanitize] of Object.entries(EDITABLE)) {
    if (key in body) { sets.push(`${key} = ?`); vals.push(sanitize((body as any)[key])); }
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  sets.push('updated_at = ?'); vals.push(new Date().toISOString()); vals.push(dealId);
  await c.env.DB.prepare(`UPDATE merchant_deals SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, before_state, after_state, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'update', ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, dealId,
    JSON.stringify({ status: deal.status }), JSON.stringify(body), new Date().toISOString()).run();

  const updated = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first();
  return c.json({ deal: updated });
});

/** POST /api/merchant/deals/:id/submit-settlement */
app.post('/:id/submit-settlement', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const body = await c.req.json<{ paid_amount: number; paid_date: string; variance_note?: string }>();
  if (!body.paid_amount || !body.paid_date) return c.json({ error: 'paid_amount and paid_date required' }, 400);

  const now = new Date().toISOString();
  const settId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(settId, dealId, deal.relationship_id, body.paid_amount, body.paid_date, body.variance_note || null, merchant.id, now).run();

  // Create approval request
  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'settlement_submit', 'settlement', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, settId,
    JSON.stringify({ paid_amount: body.paid_amount, paid_date: body.paid_date, deal_id: dealId }),
    userId, merchant.id, now).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'settlement', ?, 'create', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, settId,
    JSON.stringify({ paid_amount: body.paid_amount, deal_id: dealId }), now).run();

  return c.json({ settlement_id: settId, approval_id: approvalId }, 201);
});

/** POST /api/merchant/deals/:id/record-profit */
app.post('/:id/record-profit', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const body = await c.req.json<{ period: string; gross_profit: number; net_distributable: number; share_a?: number; share_b?: number; note?: string }>();

  const now = new Date().toISOString();
  const profitId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_profit_records (id, deal_id, relationship_id, period, gross_profit, net_distributable, share_a, share_b, note, submitted_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(profitId, dealId, deal.relationship_id, body.period, body.gross_profit, body.net_distributable,
    body.share_a ?? null, body.share_b ?? null, body.note || null, merchant.id, now).run();

  // Create approval
  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'profit_record_submit', 'profit', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, profitId, JSON.stringify(body), userId, merchant.id, now).run();

  return c.json({ profit_id: profitId, approval_id: approvalId }, 201);
});

/** POST /api/merchant/deals/:id/close */
app.post('/:id/close', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const body = await c.req.json<{ realized_pnl?: number; note?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  // Create approval for close
  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'deal_close', 'deal', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, dealId,
    JSON.stringify({ realized_pnl: (body as any).realized_pnl, note: (body as any).note }),
    userId, merchant.id, now).run();

  return c.json({ approval_id: approvalId }, 201);
});

export default app;
