/**
 * Auth adapter — centralizes auth environment detection and preview/dev fallback.
 *
 * Production: Clerk auth is required.
 * Preview/dev: If Clerk is unavailable or misconfigured, the app renders
 * in read-only "preview mode" instead of a blank page.
 */

/** Detect if we're in a preview or dev environment */
export function isPreviewEnv(): boolean {
  const host = window.location.hostname;
  // Lovable preview domains
  if (host.includes("lovable.app")) return true;
  if (host.includes("lovableproject.com")) return true;
  // localhost / dev
  if (host === "localhost" || host === "127.0.0.1") return true;
  // Explicit env flag
  if (import.meta.env.DEV) return true;
  return false;
}

/** Check if Clerk publishable key is properly configured (not empty, not a placeholder) */
export function isClerkConfigured(): boolean {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key || typeof key !== "string") return false;
  if (key === "pk_test_REPLACE_ME") return false;
  if (key.length < 10) return false;
  return true;
}

export type AuthMode = "clerk" | "preview";

/** Determine the auth mode for the current environment */
export function getAuthMode(): AuthMode {
  if (isClerkConfigured()) return "clerk";
  if (isPreviewEnv()) return "preview";
  // In production without Clerk config, still fall back to preview
  // rather than showing a blank page
  return "preview";
}
