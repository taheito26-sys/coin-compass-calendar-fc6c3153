import { useState, Suspense, lazy, useEffect } from "react";
import { getAuthMode, isClerkConfigured } from "@/lib/authAdapter";
import { PreviewAuthProvider } from "@/lib/authAdapter";
import { PAGES, PAGE_MAP, DEFAULT_PAGE, getPageTitle, validatePageId } from "@/lib/pageRegistry";
import { ErrorBoundary, PageErrorBoundary } from "@/components/ErrorBoundary";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

/* Clerk is lazy-loaded so the preview path never touches @clerk/react */
const ClerkShell = lazy(() => import("@/ClerkAuth"));

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

/* ── App Shell ── */
function AppShell({
  onLogout,
  userLabel,
  isPreview,
  showUserButton,
  UserButtonComponent,
}: {
  onLogout?: () => Promise<void>;
  userLabel?: string;
  isPreview: boolean;
  showUserButton?: boolean;
  UserButtonComponent?: React.ComponentType;
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
          {showUserButton && UserButtonComponent && (
            <div className="appUserBar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "12px 18px 0" }}>
              {userLabel && <span style={{ fontSize: 12, color: "var(--muted, #a1a1aa)" }}>{userLabel}</span>}
              <UserButtonComponent />
            </div>
          )}

          <Topbar title={title} sub={sub} onNav={handleNav} />

          <div className="scroll">
            <PageErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                {pageDef ? (
                  <PageRenderer pageDef={pageDef} onNav={handleNav} />
                ) : (
                  <div style={{ padding: 48, textAlign: "center", color: "var(--muted, #a1a1aa)" }}>
                    Page not found.{" "}
                    <button onClick={() => handleNav(DEFAULT_PAGE)} style={{ color: "var(--brand)", cursor: "pointer", background: "none", border: "none" }}>Go to Dashboard</button>
                  </div>
                )}
              </Suspense>
            </PageErrorBoundary>
          </div>
        </div>
      </div>

      {toastMsg && <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div>}
      {isPreview && <PreviewBanner />}
    </>
  );
}

function PageRenderer({ pageDef, onNav }: { pageDef: (typeof PAGES)[number]; onNav: (p: string) => void }) {
  const Component = pageDef.component;
  if (pageDef.id === "dashboard") return <Component onNav={onNav} />;
  return <Component />;
}

/* ── App entry point ── */
export default function App() {
  const authMode = getAuthMode();

  if (authMode === "clerk") {
    const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg, #0a0a0a)", color: "var(--muted, #a1a1aa)" }}>
            Loading…
          </div>
        }>
          <ClerkShell publishableKey={key}>
            {({ onLogout, userLabel, showUserButton, UserButton }) => (
              <AppShell
                onLogout={onLogout}
                userLabel={userLabel}
                isPreview={false}
                showUserButton={showUserButton}
                UserButtonComponent={UserButton}
              />
            )}
          </ClerkShell>
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Preview mode — no Clerk, no auth
  return (
    <ErrorBoundary>
      <PreviewAuthProvider>
        <CryptoProvider>
          <AppShell isPreview={true} />
        </CryptoProvider>
      </PreviewAuthProvider>
    </ErrorBoundary>
  );
}
