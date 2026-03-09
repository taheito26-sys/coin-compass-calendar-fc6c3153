import { Context, Next } from "hono";
import type { Env } from "../types";

/**
 * CORS middleware — restricts origins to ALLOWED_ORIGINS env var,
 * but also supports Lovable preview/published domains automatically.
 *
 * IMPORTANT: Always apply CORS headers in a finally block so that
 * error responses (500/401/etc) are still readable by the browser.
 */
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header("Origin") || "";
  const allowed = getAllowedOrigins(c.env);
  const isAllowed = isAllowedOrigin(origin, allowed);

  // Preflight
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(isAllowed ? origin : ""),
    });
  }

  try {
    await next();
  } finally {
    // Ensure CORS headers are set even if downstream throws
    if (isAllowed) {
      const headers = corsHeaders(origin);
      for (const [k, v] of Object.entries(headers)) {
        c.res.headers.set(k, v);
      }
    }
  }
}

function getAllowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS || "http://localhost:5173";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes("*") || allowed.includes(origin)) return true;

  // Support Lovable preview + published domains without constantly updating env
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();

    if (host.endsWith(".lovableproject.com")) return true;
    if (host.endsWith(".lovable.app")) return true;

    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch {
    return false;
  }

  return false;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
