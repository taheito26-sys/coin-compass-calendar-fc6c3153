/**
 * Auth adapter — centralizes auth environment detection and provides
 * a context bridge so CryptoProvider doesn't depend directly on Clerk.
 * @module authAdapter
 */
import React, { createContext, useContext } from "react";

/** Detect if we're in a preview or dev environment */
export function isPreviewEnv(): boolean {
  const host = window.location.hostname;
  if (host.includes("lovable.app")) return true;
  if (host.includes("lovableproject.com")) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (import.meta.env.DEV) return true;
  return false;
}

/** Check if Clerk publishable key is properly configured */
export function isClerkConfigured(): boolean {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key || typeof key !== "string") return false;
  if (key === "pk_test_REPLACE_ME") return false;
  if (key.length < 10) return false;
  return true;
}

export type AuthMode = "clerk" | "preview";

export function getAuthMode(): AuthMode {
  // In preview/dev environments, always use preview mode to avoid Clerk domain issues
  if (isPreviewEnv()) return "preview";
  if (isClerkConfigured()) return "clerk";
  return "preview";
}

/* ── Auth context bridge ── */
export interface AuthBridge {
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}

const defaultBridge: AuthBridge = {
  isSignedIn: false,
  userId: null,
  getToken: async () => null,
};

const AuthBridgeCtx = createContext<AuthBridge>(defaultBridge);

export const useAuthBridge = () => useContext(AuthBridgeCtx);

export function AuthBridgeProvider({ value, children }: { value: AuthBridge; children: React.ReactNode }) {
  return <AuthBridgeCtx.Provider value={value}>{children}</AuthBridgeCtx.Provider>;
}

/** Preview mode provider — no auth */
export function PreviewAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthBridgeCtx.Provider value={defaultBridge}>{children}</AuthBridgeCtx.Provider>;
}
