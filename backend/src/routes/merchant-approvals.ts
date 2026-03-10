import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/approvals/inbox */
app.get('/inbox', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ approvals: [] });

  // Approvals where I'm in the relationship but didn't submit
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, mp.display_name AS submitter_name, mp.nickname AS submitter_nickname
    FROM merchant_approvals a
    JOIN merchant_relationships r ON r.id = a.relationship_id
    JOIN merchant_profiles mp ON mp.id = a.submitted_by_merchant_id
    WHERE (r.merchant_a_id = ? OR r.merchant_b_id = ?)
      AND a.submitted_by_merchant_id != ?
    ORDER BY a.submitted_at DESC
  `).bind(merchant.id, merchant.id, merchant.id).all();

  return c.json({ approvals: results || [] });
});

/** GET /api/merchant/approvals/sent */
app.get('/sent', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ approvals: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT a.* FROM merchant_approvals a
    WHERE a.submitted_by_merchant_id = ?
    ORDER BY a.submitted_at DESC
  `).bind(merchant.id).all();

  return c.json({ approvals: results || [] });
});

/** POST /api/merchant/approvals/:id/approve */
app.post('/:id/approve', async (c) => {
  const userId = c.get('userId');
  const approvalId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ note?: string }>().catch(() => ({}));

  const approval = await c.env.DB.prepare(
    "SELECT * FROM merchant_approvals WHERE id = ? AND status = 'pending'"
  ).bind(approvalId).first<any>();
  if (!approval) return c.json({ error: 'Approval not found or not pending' }, 404);

  // Verify reviewer is in the relationship and not the submitter
  const rel = await c.env.DB.prepare(
    'SELECT * FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)'
  ).bind(approval.relationship_id, merchant.id, merchant.id).first<any>();
  if (!rel) return c.json({ error: 'Forbidden' }, 403);
  if (approval.submitted_by_merchant_id === merchant.id) {
    return c.json({ error: 'Cannot approve your own request' }, 403);
  }

  const now = new Date().toISOString();
  const payload = approval.proposed_payload ? JSON.parse(approval.proposed_payload) : {};

  // Apply mutation based on type
  try {
    switch (approval.type) {
      case 'settlement_submit': {
        // Update settlement status
        await c.env.DB.prepare("UPDATE merchant_settlements SET status = 'approved' WHERE id = ?")
          .bind(approval.target_entity_id).run();
        // Update deal — mark settled if full settlement
        const sett = await c.env.DB.prepare('SELECT * FROM merchant_settlements WHERE id = ?').bind(approval.target_entity_id).first<any>();
        if (sett) {
          await c.env.DB.prepare("UPDATE merchant_deals SET status = 'settled', close_date = ?, realized_pnl = COALESCE(realized_pnl, 0) + ?, updated_at = ? WHERE id = ?")
            .bind(now, sett.paid_amount, now, sett.deal_id).run();
        }
        break;
      }
      case 'profit_record_submit': {
        await c.env.DB.prepare("UPDATE merchant_profit_records SET status = 'approved' WHERE id = ?")
          .bind(approval.target_entity_id).run();
        // Update deal realized pnl
        const prof = await c.env.DB.prepare('SELECT * FROM merchant_profit_records WHERE id = ?').bind(approval.target_entity_id).first<any>();
        if (prof) {
          await c.env.DB.prepare("UPDATE merchant_deals SET realized_pnl = COALESCE(realized_pnl, 0) + ?, updated_at = ? WHERE id = ?")
            .bind(prof.net_distributable, now, prof.deal_id).run();
        }
        break;
      }
      case 'deal_close': {
        await c.env.DB.prepare("UPDATE merchant_deals SET status = 'closed', close_date = ?, realized_pnl = COALESCE(?, realized_pnl), updated_at = ? WHERE id = ?")
          .bind(now, payload.realized_pnl, now, approval.target_entity_id).run();
        break;
      }
      case 'relationship_suspend': {
        await c.env.DB.prepare("UPDATE merchant_relationships SET status = 'suspended', updated_at = ? WHERE id = ?")
          .bind(now, approval.relationship_id).run();
        break;
      }
      case 'relationship_terminate': {
        await c.env.DB.prepare("UPDATE merchant_relationships SET status = 'terminated', updated_at = ? WHERE id = ?")
          .bind(now, approval.relationship_id).run();
        break;
      }
      case 'capital_adjustment': {
        if (payload.new_amount != null) {
          await c.env.DB.prepare("UPDATE merchant_deals SET amount = ?, updated_at = ? WHERE id = ?")
            .bind(payload.new_amount, now, approval.target_entity_id).run();
        }
        break;
      }
    }
  } catch (err: any) {
    return c.json({ error: `Mutation failed: ${err.message}` }, 500);
  }

  // Update approval
  await c.env.DB.prepare(
    "UPDATE merchant_approvals SET status = 'approved', resolution_note = ?, resolved_at = ? WHERE id = ?"
  ).bind((body as any).note || null, now, approvalId).run();

  // Notify submitter
  const submitterProfile = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?')
    .bind(approval.submitted_by_merchant_id).first<any>();
  if (submitterProfile) {
    await c.env.DB.prepare(`
      INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
      VALUES (?, ?, ?, 'approval', ?, ?, 'approval', ?, ?)
    `).bind(crypto.randomUUID(), submitterProfile.owner_user_id, approval.submitted_by_merchant_id,
      `Your ${approval.type} request was approved`, (body as any).note || 'Approved by counterparty',
      approvalId, now).run();
  }

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, before_state, after_state, note, created_at)
    VALUES (?, ?, ?, 'approval', ?, 'approve', ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, approvalId,
    JSON.stringify({ status: 'pending' }), JSON.stringify({ status: 'approved', type: approval.type }),
    (body as any).note || null, now).run();

  // System message
  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, created_at)
    VALUES (?, ?, ?, ?, 'system', ?, ?)
  `).bind(crypto.randomUUID(), approval.relationship_id, userId, merchant.id,
    `✅ ${approval.type} approved by ${merchant.display_name}`, now).run();

  return c.json({ ok: true, type: approval.type });
});

/** POST /api/merchant/approvals/:id/reject */
app.post('/:id/reject', async (c) => {
  const userId = c.get('userId');
  const approvalId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ note?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  const approval = await c.env.DB.prepare(
    "SELECT * FROM merchant_approvals WHERE id = ? AND status = 'pending'"
  ).bind(approvalId).first<any>();
  if (!approval) return c.json({ error: 'Not found' }, 404);

  // Reject settlement/profit too
  if (approval.type === 'settlement_submit') {
    await c.env.DB.prepare("UPDATE merchant_settlements SET status = 'rejected' WHERE id = ?")
      .bind(approval.target_entity_id).run();
  } else if (approval.type === 'profit_record_submit') {
    await c.env.DB.prepare("UPDATE merchant_profit_records SET status = 'rejected' WHERE id = ?")
      .bind(approval.target_entity_id).run();
  }

  await c.env.DB.prepare(
    "UPDATE merchant_approvals SET status = 'rejected', resolution_note = ?, resolved_at = ? WHERE id = ?"
  ).bind((body as any).note || null, now, approvalId).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, note, created_at)
    VALUES (?, ?, ?, 'approval', ?, 'reject', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, approvalId, (body as any).note || null, now).run();

  return c.json({ ok: true });
});

export default app;
