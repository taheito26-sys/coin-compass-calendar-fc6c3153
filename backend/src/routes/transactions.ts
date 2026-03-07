import { Hono } from 'hono';
import type { Env, TransactionRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// All transaction routes require auth
app.use('/*', authMiddleware);

/** GET /api/transactions */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(`
    SELECT t.*, a.symbol AS asset_symbol, a.name AS asset_name
    FROM transactions t
    JOIN assets a ON t.asset_id = a.id
    WHERE t.user_id = ?
    ORDER BY t.timestamp DESC
  `).bind(userId).all<TransactionRow & { asset_symbol: string; asset_name: string }>();

  return c.json({ transactions: results || [] });
});

/** POST /api/transactions */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    asset_id: string;
    timestamp: string;
    type: string;
    qty: number;
    unit_price?: number;
    fee_amount?: number;
    fee_currency?: string;
    venue?: string;
    note?: string;
    tags?: string[];
    source?: string;
    external_id?: string;
  }>();

  if (!body.asset_id || !body.timestamp || !body.type || body.qty == null) {
    return c.json({ error: 'Missing required fields: asset_id, timestamp, type, qty' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO transactions (id, user_id, asset_id, timestamp, type, qty, unit_price, fee_amount, fee_currency, venue, note, tags, source, external_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, body.asset_id, body.timestamp, body.type, body.qty,
    body.unit_price ?? 0, body.fee_amount ?? 0, body.fee_currency ?? 'USD',
    body.venue ?? null, body.note ?? null,
    body.tags ? JSON.stringify(body.tags) : null,
    body.source ?? 'manual', body.external_id ?? null,
    now, now,
  ).run();

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<TransactionRow>();
  return c.json({ transaction: row }, 201);
});

/** PUT /api/transactions/:id */
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const txId = c.req.param('id');

  // Verify ownership
  const existing = await c.env.DB.prepare(
    'SELECT id FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(txId, userId).first();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json<Partial<{
    timestamp: string; type: string; qty: number; unit_price: number;
    fee_amount: number; fee_currency: string; venue: string; note: string;
    tags: string[]; source: string;
  }>>();

  const sets: string[] = [];
  const vals: unknown[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (key === 'tags') {
      sets.push('tags = ?');
      vals.push(JSON.stringify(val));
    } else {
      sets.push(`${key} = ?`);
      vals.push(val);
    }
  }

  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(txId);

  await c.env.DB.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first<TransactionRow>();
  return c.json({ transaction: row });
});

/** DELETE /api/transactions/:id */
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const txId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(txId, userId).run();

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default app;
