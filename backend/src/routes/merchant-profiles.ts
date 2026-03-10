import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

function generateMerchantId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `MRC-${hex}`;
}

/** GET /api/merchant/profile/me */
app.get('/profile/me', async (c) => {
  const userId = c.get('userId');
  const row = await c.env.DB.prepare(
    'SELECT * FROM merchant_profiles WHERE owner_user_id = ?'
  ).bind(userId).first();
  if (!row) return c.json({ profile: null });
  return c.json({ profile: row });
});

/** POST /api/merchant/profile — create merchant profile */
app.post('/profile', async (c) => {
  const userId = c.get('userId');

  // Check if user already has a profile
  const existing = await c.env.DB.prepare(
    'SELECT id FROM merchant_profiles WHERE owner_user_id = ?'
  ).bind(userId).first();
  if (existing) return c.json({ error: 'You already have a merchant profile' }, 409);

  const body = await c.req.json<{
    nickname: string;
    display_name: string;
    merchant_type?: string;
    region?: string;
    default_currency?: string;
    discoverability?: string;
    bio?: string;
  }>();

  if (!body.nickname || !body.display_name) {
    return c.json({ error: 'nickname and display_name are required' }, 400);
  }

  // Validate nickname format
  const nick = body.nickname.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(nick)) {
    return c.json({ error: 'Nickname must be 3-30 chars: a-z, 0-9, underscore only' }, 400);
  }

  // Check uniqueness
  const nickExists = await c.env.DB.prepare(
    'SELECT id FROM merchant_profiles WHERE nickname = ?'
  ).bind(nick).first();
  if (nickExists) return c.json({ error: 'Nickname already taken' }, 409);

  const id = crypto.randomUUID();
  const merchantId = generateMerchantId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(
    id, userId, merchantId, nick, body.display_name.trim(),
    body.merchant_type || 'independent', body.region || null,
    body.default_currency || 'USDT', body.discoverability || 'public',
    body.bio || null, now, now
  ).run();

  const profile = await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE id = ?').bind(id).first();
  return c.json({ profile }, 201);
});

/** PATCH /api/merchant/profile/me */
app.patch('/profile/me', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<Partial<{
    display_name: string; merchant_type: string; region: string;
    default_currency: string; discoverability: string; bio: string;
  }>>();

  const EDITABLE: Record<string, (v: unknown) => unknown> = {
    display_name: v => String(v).trim(),
    merchant_type: v => String(v),
    region: v => v == null ? null : String(v),
    default_currency: v => String(v),
    discoverability: v => String(v),
    bio: v => v == null ? null : String(v),
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, sanitize] of Object.entries(EDITABLE)) {
    if (key in body) { sets.push(`${key} = ?`); vals.push(sanitize((body as any)[key])); }
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(userId);

  await c.env.DB.prepare(`UPDATE merchant_profiles SET ${sets.join(', ')} WHERE owner_user_id = ?`).bind(...vals).run();
  const profile = await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first();
  return c.json({ profile });
});

/** GET /api/merchant/profile/:merchantId */
app.get('/profile/:merchantId', async (c) => {
  const mid = c.req.param('merchantId');
  const row = await c.env.DB.prepare(
    "SELECT id, merchant_id, nickname, display_name, merchant_type, region, default_currency, bio, status, created_at FROM merchant_profiles WHERE (merchant_id = ? OR id = ?) AND status = 'active'"
  ).bind(mid, mid).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ profile: row });
});

/** GET /api/merchant/search?q= */
app.get('/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q || q.length < 2) return c.json({ results: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT id, merchant_id, nickname, display_name, merchant_type, region, bio, status
    FROM merchant_profiles
    WHERE status = 'active'
      AND discoverability != 'hidden'
      AND (merchant_id = ? OR nickname LIKE ? OR display_name LIKE ?)
    LIMIT 20
  `).bind(q, `%${q}%`, `%${q}%`).all();

  return c.json({ results: results || [] });
});

/** GET /api/merchant/check-nickname?nickname= */
app.get('/check-nickname', async (c) => {
  const nick = (c.req.query('nickname') || '').trim().toLowerCase();
  if (!nick) return c.json({ available: false });
  const exists = await c.env.DB.prepare(
    'SELECT id FROM merchant_profiles WHERE nickname = ?'
  ).bind(nick).first();
  return c.json({ available: !exists });
});

export default app;
