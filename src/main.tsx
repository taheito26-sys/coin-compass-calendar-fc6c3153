import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import './index.css';
import './responsive-overrides.css';

const DEFAULT_CLERK_JS_URL = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const configuredClerkJsUrl = import.meta.env.VITE_CLERK_JS_URL?.trim();
const allowCustomClerkJsUrl = import.meta.env.VITE_ALLOW_CUSTOM_CLERK_JS_URL === "true";

function isTrustedClerkScriptHost(url: URL) {
  return ["cdn.jsdelivr.net", "unpkg.com", "cdn.clerk.com"].includes(url.hostname);
}

const clerkJsUrl = (() => {
  if (!configuredClerkJsUrl) return DEFAULT_CLERK_JS_URL;

  try {
    const parsed = new URL(configuredClerkJsUrl);
    const looksLikePagesProxy =
      parsed.hostname.endsWith(".pages.dev") && parsed.pathname.includes("/npm/@clerk/clerk-js");

    if (looksLikePagesProxy) {
      console.warn(
        `Ignoring VITE_CLERK_JS_URL (${configuredClerkJsUrl}) because Cloudflare Pages proxy URLs often fail with 404/CORS. Falling back to jsDelivr CDN.`,
      );
      return DEFAULT_CLERK_JS_URL;
    }

    if (!allowCustomClerkJsUrl && !isTrustedClerkScriptHost(parsed)) {
      console.warn(
        `Ignoring untrusted VITE_CLERK_JS_URL host (${parsed.hostname}). Set VITE_ALLOW_CUSTOM_CLERK_JS_URL=true to opt in. Falling back to jsDelivr CDN.`,
      );
      return DEFAULT_CLERK_JS_URL;
    }

    return configuredClerkJsUrl;
  } catch {
    console.warn(
      `Ignoring invalid VITE_CLERK_JS_URL (${configuredClerkJsUrl}). Falling back to jsDelivr CDN.`,
    );
    return DEFAULT_CLERK_JS_URL;
  }
})();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

if (!clerkKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

root.render(
  <ClerkProvider publishableKey={clerkKey} clerkJSUrl={clerkJsUrl}>
    <App />
  </ClerkProvider>,
);
