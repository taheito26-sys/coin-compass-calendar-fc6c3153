import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Phase A auth middleware — verifies Supabase JWTs using HMAC-SHA256.
 * Extracts user_id from the `sub` claim and sets it on the context.
 * No supabase-js dependency needed.
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const secret = c.env.SUPABASE_JWT_SECRET;

  if (!secret) {
    console.error('SUPABASE_JWT_SECRET not configured');
    return c.json({ error: 'Server misconfiguration' }, 500);
  }

  try {
    const payload = await verifyHS256(token, secret);
    const userId = payload.sub;
    if (!userId || typeof userId !== 'string') {
      return c.json({ error: 'Invalid token: missing sub' }, 401);
    }

    // Check expiration
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) {
      return c.json({ error: 'Token expired' }, 401);
    }

    c.set('userId', userId);
    await next();
  } catch (err) {
    console.error('JWT verification failed:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
}

/**
 * Verify HS256 JWT without external libraries.
 * Uses Web Crypto API available in Cloudflare Workers.
 */
async function verifyHS256(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify header is HS256
  const header = JSON.parse(b64UrlDecode(headerB64));
  if (header.alg !== 'HS256') throw new Error(`Unsupported algorithm: ${header.alg}`);

  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // Verify signature
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64UrlToBuffer(signatureB64);
  const valid = await crypto.subtle.verify('HMAC', key, signature, data);

  if (!valid) throw new Error('Invalid signature');

  return JSON.parse(b64UrlDecode(payloadB64));
}

function b64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

function b64UrlToBuffer(str: string): ArrayBuffer {
  const binary = b64UrlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
