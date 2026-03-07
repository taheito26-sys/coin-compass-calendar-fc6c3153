import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * CORS middleware — restricts origins to ALLOWED_ORIGINS env var.
 * In dev, also allows localhost:5173.
 */
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins(c.env);
  const isAllowed = allowed.includes('*') || allowed.includes(origin);

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(isAllowed ? origin : ''),
    });
  }

  await next();

  if (isAllowed) {
    const headers = corsHeaders(origin);
    for (const [k, v] of Object.entries(headers)) {
      c.res.headers.set(k, v);
    }
  }
}

function getAllowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS || 'http://localhost:5173';
  return raw.split(',').map(s => s.trim());
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
