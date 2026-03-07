import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Auth middleware — verifies Clerk JWTs using RS256 / JWKS.
 * Fetches Clerk's public keys from JWKS URL, verifies signature,
 * extracts user_id from the `sub` claim.
 */

// Cache JWKS keys in memory (Worker instance lifetime)
let _jwksCache: Map<string, CryptoKey> = new Map();
let _jwksCacheTs = 0;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  // Default Clerk JWKS URL pattern
  const jwksUrl = c.env.CLERK_JWKS_URL;
  if (!jwksUrl) {
    console.error('CLERK_JWKS_URL not configured');
    return c.json({ error: 'Server misconfiguration: missing JWKS URL' }, 500);
  }

  try {
    const payload = await verifyRS256(token, jwksUrl);
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
 * Verify RS256 JWT using JWKS endpoint.
 * Uses Web Crypto API available in Cloudflare Workers.
 */
async function verifyRS256(token: string, jwksUrl: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;

  // Parse header to get kid
  const header = JSON.parse(b64UrlDecode(headerB64));
  if (header.alg !== 'RS256') throw new Error(`Unsupported algorithm: ${header.alg}`);

  const kid = header.kid;
  if (!kid) throw new Error('JWT missing kid in header');

  // Get the public key from JWKS
  const key = await getJWKSKey(jwksUrl, kid);
  if (!key) throw new Error(`No matching key found for kid: ${kid}`);

  // Verify signature
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64UrlToBuffer(signatureB64);
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    key,
    signature,
    data
  );

  if (!valid) throw new Error('Invalid signature');

  return JSON.parse(b64UrlDecode(payloadB64));
}

async function getJWKSKey(jwksUrl: string, kid: string): Promise<CryptoKey | null> {
  // Check cache
  if (_jwksCache.has(kid) && Date.now() - _jwksCacheTs < JWKS_CACHE_TTL) {
    return _jwksCache.get(kid)!;
  }

  // Fetch JWKS
  const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
  const jwks: { keys: JsonWebKey[] } = await res.json();

  // Import all keys
  _jwksCache = new Map();
  _jwksCacheTs = Date.now();

  for (const jwk of jwks.keys) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      _jwksCache.set(jwk.kid as string, key);
    } catch (e) {
      console.warn(`Failed to import JWK kid=${jwk.kid}:`, e);
    }
  }

  return _jwksCache.get(kid) ?? null;
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
