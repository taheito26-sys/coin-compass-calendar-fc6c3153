/**
 * Clerk authentication shell — only imported when Clerk is configured.
 * Isolated so the preview/dev path never loads @clerk/react.
 */
import { ClerkProvider, SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { AuthBridgeProvider } from "@/lib/auth";
import { CryptoProvider } from "@/lib/cryptoContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface ClerkShellProps {
  publishableKey: string;
  children: (props: {
    onLogout: () => Promise<void>;
    userLabel: string;
    showUserButton: true;
    UserButton: typeof UserButton;
  }) => React.ReactNode;
}

function ClerkRoot({ children }: { children: ClerkShellProps["children"] }) {
  const { isLoaded, isSignedIn, signOut, getToken, userId } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg, #0a0a0a)", color: "var(--muted, #a1a1aa)" }}>
        Loading authentication…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "radial-gradient(circle at top, rgba(59,130,246,0.15), transparent 30%), var(--bg, #0a0a0a)" }}>
        <div style={{ width: "min(980px, 100%)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "center" }}>
          <div style={{ color: "var(--text, #ffffff)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "var(--muted, #cbd5e1)", fontSize: 12, marginBottom: 16 }}>CoinCompass login</div>
            <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "0 0 12px" }}>Sign in once, keep the portfolio synced everywhere.</h1>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--muted, #a1a1aa)", margin: 0 }}>Use email and password for the simplest path.</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}>
            <SignIn routing="hash" />
          </div>
        </div>
      </div>
    );
  }

  const userLabel = user?.primaryEmailAddress?.emailAddress || user?.username || user?.fullName || "Signed in";

  return (
    <AuthBridgeProvider value={{ isSignedIn: true, userId: userId ?? null, getToken: () => getToken() }}>
      <CryptoProvider>
        {children({
          onLogout: () => signOut(),
          userLabel,
          showUserButton: true,
          UserButton,
        })}
      </CryptoProvider>
    </AuthBridgeProvider>
  );
}

export default function ClerkShell({ publishableKey, children }: ClerkShellProps) {
  return (
    <ErrorBoundary>
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkRoot>{children}</ClerkRoot>
      </ClerkProvider>
    </ErrorBoundary>
  );
}
