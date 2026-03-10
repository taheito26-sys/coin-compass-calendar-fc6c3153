import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** POST /api/merchant/invites */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'Create merchant profile first' }, 403);

  const body = await c.req.json<{
    to_merchant_id: string;
    purpose?: string;
    requested_role?: string;
    message?: string;
    requested_scope?: string[];
  }>();

  if (!body.to_merchant_id) return c.json({ error: 'to_merchant_id required' }, 400);
  if (body.to_merchant_id === merchant.id) return c.json({ error: 'Cannot invite yourself' }, 400);

  // Check target exists
  const target = await c.env.DB.prepare(
    "SELECT id, status FROM merchant_profiles WHERE id = ? AND status = 'active'"
  ).bind(body.to_merchant_id).first();
  if (!target) return c.json({ error: 'Target merchant not found' }, 404);

  // Check no existing active invite or relationship
  const existingInvite = await c.env.DB.prepare(
    "SELECT id FROM merchant_invites WHERE from_merchant_id = ? AND to_merchant_id = ? AND status = 'pending'"
  ).bind(merchant.id, body.to_merchant_id).first();
  if (existingInvite) return c.json({ error: 'Pending invite already exists' }, 409);

  const existingRel = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE ((merchant_a_id = ? AND merchant_b_id = ?) OR (merchant_a_id = ? AND merchant_b_id = ?)) AND status IN ('active','restricted')"
  ).bind(merchant.id, body.to_merchant_id, body.to_merchant_id, merchant.id).first();
  if (existingRel) return c.json({ error: 'Active relationship already exists' }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_invites (id, from_merchant_id, to_merchant_id, status, purpose, requested_role, message, requested_scope, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, merchant.id, body.to_merchant_id, body.purpose || null,
    body.requested_role || 'operator', body.message || null,
    body.requested_scope ? JSON.stringify(body.requested_scope) : null,
    expiresAt, now, now
  ).run();

  // Create notification for receiver
  const targetProfile = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?').bind(body.to_merchant_id).first<any>();
  if (targetProfile) {
    await c.env.DB.prepare(`
      INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
      VALUES (?, ?, ?, 'invite', ?, ?, 'invite', ?, ?)
    `).bind(crypto.randomUUID(), targetProfile.owner_user_id, body.to_merchant_id, 
      `New invite from ${merchant.display_name}`, body.message || 'You have a new collaboration invite',
      id, now).run();
  }

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'invite', ?, 'create', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, id, JSON.stringify({ to: body.to_merchant_id, purpose: body.purpose }), now).run();

  const invite = await c.env.DB.prepare('SELECT * FROM merchant_invites WHERE id = ?').bind(id).first();
  return c.json({ invite }, 201);
});

/** GET /api/merchant/invites/inbox */
app.get('/inbox', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ invites: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT i.*, mp.display_name AS from_display_name, mp.nickname AS from_nickname, mp.merchant_id AS from_merchant_code
    FROM merchant_invites i
    JOIN merchant_profiles mp ON mp.id = i.from_merchant_id
    WHERE i.to_merchant_id = ?
    ORDER BY i.created_at DESC
  `).bind(merchant.id).all();
  return c.json({ invites: results || [] });
});

/** GET /api/merchant/invites/sent */
app.get('/sent', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ invites: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT i.*, mp.display_name AS to_display_name, mp.nickname AS to_nickname, mp.merchant_id AS to_merchant_code
    FROM merchant_invites i
    JOIN merchant_profiles mp ON mp.id = i.to_merchant_id
    WHERE i.from_merchant_id = ?
    ORDER BY i.created_at DESC
  `).bind(merchant.id).all();
  return c.json({ invites: results || [] });
});

/** POST /api/merchant/invites/:id/accept */
app.post('/:id/accept', async (c) => {
  const userId = c.get('userId');
  const inviteId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const invite = await c.env.DB.prepare(
    "SELECT * FROM merchant_invites WHERE id = ? AND to_merchant_id = ? AND status = 'pending'"
  ).bind(inviteId, merchant.id).first<any>();
  if (!invite) return c.json({ error: 'Invite not found or not pending' }, 404);

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await c.env.DB.prepare("UPDATE merchant_invites SET status = 'expired', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), inviteId).run();
    return c.json({ error: 'Invite has expired' }, 410);
  }

  const now = new Date().toISOString();
  const relId = crypto.randomUUID();

  // Create relationship
  await c.env.DB.prepare(`
    INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, invite_id, relationship_type, status, approval_policy, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'general', 'active', ?, ?, ?)
  `).bind(relId, invite.from_merchant_id, merchant.id, inviteId,
    JSON.stringify({ settlements: true, profits: true, capital_changes: true, closures: true }),
    now, now).run();

  // Create roles
  await c.env.DB.prepare(`
    INSERT INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)
  `).bind(crypto.randomUUID(), relId, invite.from_merchant_id, now).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), relId, merchant.id, invite.requested_role || 'operator', now).run();

  // Update invite
  await c.env.DB.prepare("UPDATE merchant_invites SET status = 'accepted', updated_at = ? WHERE id = ?")
    .bind(now, inviteId).run();

  // Notify sender
  const senderProfile = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?').bind(invite.from_merchant_id).first<any>();
  if (senderProfile) {
    await c.env.DB.prepare(`
      INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
      VALUES (?, ?, ?, 'invite', ?, ?, 'relationship', ?, ?)
    `).bind(crypto.randomUUID(), senderProfile.owner_user_id, invite.from_merchant_id,
      `${merchant.display_name} accepted your invite`, 'Your collaboration invite was accepted',
      relId, now).run();
  }

  // System message
  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, created_at)
    VALUES (?, ?, ?, ?, 'system', ?, ?)
  `).bind(crypto.randomUUID(), relId, userId, merchant.id,
    `Collaboration started between ${invite.from_merchant_id} and ${merchant.display_name}`, now).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'invite', ?, 'approve', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, inviteId,
    JSON.stringify({ relationship_id: relId }), now).run();

  return c.json({ relationship_id: relId, status: 'accepted' });
});

/** POST /api/merchant/invites/:id/reject */
app.post('/:id/reject', async (c) => {
  const userId = c.get('userId');
  const inviteId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    "UPDATE merchant_invites SET status = 'rejected', updated_at = ? WHERE id = ? AND to_merchant_id = ? AND status = 'pending'"
  ).bind(now, inviteId, merchant.id).run();
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, note, created_at)
    VALUES (?, ?, ?, 'invite', ?, 'reject', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, inviteId, (body as any).reason || null, now).run();

  return c.json({ ok: true });
});

/** POST /api/merchant/invites/:id/withdraw */
app.post('/:id/withdraw', async (c) => {
  const userId = c.get('userId');
  const inviteId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    "UPDATE merchant_invites SET status = 'withdrawn', updated_at = ? WHERE id = ? AND from_merchant_id = ? AND status = 'pending'"
  ).bind(now, inviteId, merchant.id).run();
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);

  return c.json({ ok: true });
});

export default app;
