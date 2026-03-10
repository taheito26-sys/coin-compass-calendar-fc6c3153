import { useState, Suspense } from "react";
import { getAuthMode, isClerkConfigured } from "@/lib/authAdapter";
import { PAGES, PAGE_MAP, DEFAULT_PAGE, getPageTitle, validatePageId } from "@/lib/pageRegistry";
import { ErrorBoundary, PageErrorBoundary } from "@/components/ErrorBoundary";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

/* ── Preview mode banner ── */
function PreviewBanner() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(234, 179, 8, 0.15)",
        border: "1px solid rgba(234, 179, 8, 0.3)",
        borderRadius: 8,
        padding: "5px 14px",
        fontSize: 11,
        fontWeight: 600,
        color: "#eab308",
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
      }}
    >
      Preview mode · Auth disabled · Read-only
    </div>
  );
}

/* ── Loading fallback for lazy pages ── */
function PageLoader() {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--muted, #a1a1aa)" }}>
      Loading…
    </div>
  );
}

/* ── App Shell — renders sidebar + topbar + active page ── */
function AppShell({
  onLogout,
  userLabel,
  isPreview,
}: {
  onLogout?: () => Promise<void>;
  userLabel?: string;
  isPreview: boolean;
}) {
  const [pageId, setPageId] = useState(DEFAULT_PAGE);
  const { toastMsg } = useCrypto();

  const safePage = validatePageId(pageId);
  const [title, sub] = getPageTitle(safePage);
  const pageDef = PAGE_MAP.get(safePage);

  const handleNav = (id: string) => setPageId(validatePageId(id));

  return (
    <>
      <div className="app">
        <Sidebar page={safePage} onNav={handleNav} onLogout={onLogout} />
        <div className="mainWrap">
          {/* User bar — only in Clerk mode */}
          {!isPreview && (
            <ClerkUserBar userLabel={userLabel} />
          )}

          <Topbar title={title} sub={sub} onNav={handleNav} />

          <div className="scroll">
            <PageErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                {pageDef ? (
                  <PageRenderer pageDef={pageDef} onNav={handleNav} />
                ) : (
                  <div style={{ padding: 48, textAlign: "center", color: "var(--muted, #a1a1aa)" }}>
                    Page not found. <button onClick={() => handleNav(DEFAULT_PAGE)} style={{ color: "var(--brand)", cursor: "pointer", background: "none", border: "none" }}>Go to Dashboard</button>
                  </div>
                )}
              </Suspense>
            </PageErrorBoundary>
          </div>
        </div>
      </div>

      {toastMsg ? <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div> : null}
      {isPreview && <PreviewBanner />}
    </>
  );
}

/* ── Render page component, passing onNav to dashboard ── */
function PageRenderer({ pageDef, onNav }: { pageDef: (typeof PAGES)[number]; onNav: (p: string) => void }) {
  const Component = pageDef.component;
  // DashboardPage accepts onNav prop
  if (pageDef.id === "dashboard") {
    return <Component onNav={onNav} />;
  }
  return <Component />;
}

/* ── Clerk-specific user bar (only loaded when Clerk is active) ── */
function ClerkUserBar({ userLabel }: { userLabel?: string }) {
  // Dynamically import Clerk's UserButton to avoid crashing if Clerk isn't loaded
  try {
    const { UserButton } = require("@clerk/react");
    return (
      <div
        className="appUserBar"
        style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "12px 18px 0" }}
      >
        {userLabel ? (
          <span style={{ fontSize: 12, color: "var(--muted, #a1a1aa)" }}>{userLabel}</span>
        ) : null}
        <UserButton />
      </div>
    );
  } catch {
    return null;
  }
}

/* ── Clerk auth root — only used when Clerk is configured ── */
function ClerkRoot() {
  // These imports are safe because ClerkRoot is only rendered inside ClerkProvider
  const { useAuth, useUser } = require("@clerk/react");
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg, #0a0a0a)", color: "var(--muted, #a1a1aa)" }}>
        Loading authentication…
      </div>
    );
  }

  if (!isSignedIn) {
    const { SignIn } = require("@clerk/react");
    return (
      <div
        style={{
          minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
          background: "radial-gradient(circle at top, rgba(59,130,246,0.15), transparent 30%), var(--bg, #0a0a0a)",
        }}
      >
        <div style={{ width: "min(980px, 100%)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "center" }}>
          <div style={{ color: "var(--text, #ffffff)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "var(--muted, #cbd5e1)", fontSize: 12, marginBottom: 16 }}>
              CoinCompass login
            </div>
            <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "0 0 12px" }}>
              Sign in once, keep the portfolio synced everywhere.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--muted, #a1a1aa)", margin: 0 }}>
              Use email and password for the simplest path.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}>
            <SignIn routing="hash" />
          </div>
        </div>
      </div>
    );
  }

  const userLabel = user?.primaryEmailAddress?.emailAddress || user?.username || user?.fullName || "Signed in";
  return <AppShell onLogout={() => signOut()} userLabel={userLabel} isPreview={false} />;
}

/* ── App entry point ── */
export default function App() {
  const authMode = getAuthMode();

  return (
    <ErrorBoundary>
      <CryptoProvider>
        {authMode === "clerk" ? (
          <ClerkAuthWrapper />
        ) : (
          <AppShell isPreview={true} />
        )}
      </CryptoProvider>
    </ErrorBoundary>
  );
}

/* ── Clerk wrapper — dynamically loads ClerkProvider ── */
function ClerkAuthWrapper() {
  try {
    const { ClerkProvider } = require("@clerk/react");
    const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    return (
      <ClerkProvider publishableKey={clerkKey}>
        <ClerkRoot />
      </ClerkProvider>
    );
  } catch (err) {
    console.error("[auth] Clerk failed to load, falling back to preview mode:", err);
    return <AppShell isPreview={true} />;
  }
}
