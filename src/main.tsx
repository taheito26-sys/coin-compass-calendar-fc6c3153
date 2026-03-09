import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import './index.css';
import './responsive-overrides.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_ZmFuY3ktc3VuYmVhbS0zNy5jbGVyay5hY2NvdW50cy5kZXYk";

function MissingClerkConfig() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg, #0a0a0a)",
        color: "var(--text, #ffffff)",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(640px, 100%)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>CoinCompass</div>
        <div style={{ color: "var(--muted, #a1a1aa)", marginBottom: 18 }}>
          Authentication is required for the cloud-backed app.
        </div>
        <div style={{ lineHeight: 1.6, color: "var(--muted2, #d4d4d8)" }}>
          Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code> in your frontend environment.
          Add it to <code>.env.local</code>, then restart Vite.
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

if (!clerkKey) {
  root.render(<MissingClerkConfig />);
} else {
  root.render(
    <ClerkProvider publishableKey={clerkKey}>
      <App />
    </ClerkProvider>,
  );
}
