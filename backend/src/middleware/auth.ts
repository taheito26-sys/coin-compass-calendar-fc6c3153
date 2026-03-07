import { Context, Next } from "hono";
import type { Env } from "../types";

let jwksCache: Map<string, CryptoKey> = new Map();
let jwksCacheTs = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwksUrl = c.env.CLERK_JWKS_URL;
  if (!jwksUrl) {
    console.error("CLERK_JWKS_URL is missing");
    return c.json({ error: "Server misconfiguration: missing Clerk JWKS URL" }, 500);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyRs256(token, jwksUrl);
    const now = Date.now() / 1000;
    const userId = payload.sub;

    if (!userId || typeof userId !== "string") {
      return c.json({ error: "Invalid token: missing sub" }, 401);
    }

    if (typeof payload.exp === "number" && payload.exp < now) {
      return c.json({ error: "Token expired" }, 401);
    }

    if (typeof payload.nbf === "number" && payload.nbf > now) {
      return c.json({ error: "Token not active yet" }, 401);
    }

    c.set("userId", userId);
    await next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    return c.json({ error: "Invalid token" }, 401);
  }
}

async function verifyRs256(
  token: string,
  jwksUrl: string,
): Promise<Record<string, string | number | boolean | null | undefined>> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64)) as { alg?: string; kid?: string };

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported algorithm: ${header.alg ?? "unknown"}`);
  }

  if (!header.kid) {
    throw new Error("JWT missing kid in header");
  }

  const key = await getJwksKey(jwksUrl, header.kid);
  if (!key) {
    throw new Error(`No matching key found for kid: ${header.kid}`);
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBuffer(signatureB64);

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    signature,
    data,
  );

  if (!valid) {
    throw new Error("Invalid signature");
  }

  return JSON.parse(base64UrlDecode(payloadB64));
}

async function getJwksKey(jwksUrl: string, kid: string): Promise<CryptoKey | null> {
  if (jwksCache.has(kid) && Date.now() - jwksCacheTs < JWKS_CACHE_TTL_MS) {
    return jwksCache.get(kid) ?? null;
  }

  const response = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = (await response.json()) as { keys?: JsonWebKey[] };

  jwksCache = new Map();
  jwksCacheTs = Date.now();

  for (const jwk of jwks.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;

    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      jwksCache.set(jwk.kid, key);
    } catch (error) {
      console.warn(`Failed to import JWK kid=${jwk.kid}:`, error);
    }
  }

  return jwksCache.get(kid) ?? null;
}

function normalizeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  return pad === 0 ? normalized : `${normalized}${"=".repeat(4 - pad)}`;
}

function base64UrlDecode(input: string): string {
  return atob(normalizeBase64Url(input));
}

function base64UrlToBuffer(input: string): ArrayBuffer {
  const binary = atob(normalizeBase64Url(input));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}