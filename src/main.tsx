import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import './index.css';
import './responsive-overrides.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkJsUrl = import.meta.env.VITE_CLERK_JS_URL || "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";

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
