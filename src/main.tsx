import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import './index.css';
import './responsive-overrides.css';

const DEFAULT_CLERK_JS_URL = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const configuredClerkJsUrl = import.meta.env.VITE_CLERK_JS_URL;

const clerkJsUrl = (() => {
  if (!configuredClerkJsUrl) return DEFAULT_CLERK_JS_URL;

  const hasKnownPagesProxyPattern =
    configuredClerkJsUrl.includes(".pages.dev") && configuredClerkJsUrl.includes("/npm/@clerk/clerk-js");

  if (hasKnownPagesProxyPattern) {
    console.warn(
      `Ignoring VITE_CLERK_JS_URL (${configuredClerkJsUrl}) because Cloudflare Pages proxy URLs often fail with 404/CORS. Falling back to jsDelivr CDN.`,
    );
    return DEFAULT_CLERK_JS_URL;
  }

  return configuredClerkJsUrl;
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
