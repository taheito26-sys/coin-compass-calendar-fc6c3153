import { forwardRef } from "react";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import { useAuth, useUser, SignIn, UserButton } from "@clerk/clerk-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import LedgerPage from "@/pages/LedgerPage";
import CalendarPage from "@/pages/CalendarPage";
import MarketsPage from "@/pages/MarketsPage";
import SettingsPage from "@/pages/SettingsPage";
import VaultPage from "@/pages/VaultPage";
import { useState } from "react";

const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs · Allocation · Heatmap"],
  assets: ["Assets", "Positions · P&L · Lots"],
  calendar: ["Calendar", "Daily P&L · Per Coin"],
  ledger: ["Ledger", "Journal · Import · Manual Entry"],
  markets: ["Live Markets", "Bubbles · Prices · Watchlist"],
  vault: ["Vault", "Snapshots · Backups · Export"],
  settings: ["Settings", "Layout · Themes · Data"],
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const clerkAvailable = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  // If Clerk isn't configured, skip auth entirely
  if (!clerkAvailable) {
    return <>{children}</>;
  }

  return <ClerkAuthGate>{children}</ClerkAuthGate>;
}

function ClerkAuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [skipAuth, setSkipAuth] = useState(false);

  if (!isLoaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg, #0a0a0a)", color: "var(--muted, #888)" }}>
        Loading…
      </div>
    );
  }

  if (!isSignedIn && !skipAuth) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", background: "var(--bg, #0a0a0a)",
        fontFamily: "var(--lt-font, 'Inter', sans-serif)",
        flexDirection: "column", gap: 24,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text, #fff)" }}>CoinCompass</h1>
        <SignIn routing="hash" />
        <button
          onClick={() => setSkipAuth(true)}
          style={{ background: "none", border: "none", color: "var(--muted2, #666)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
        >
          Continue without account
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

function AppShell() {
  const [page, setPage] = useState("dashboard");
  const { toastMsg } = useCrypto();
  const clerkAvailable = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const auth = clerkAvailable ? useAuth() : { signOut: async () => {}, isSignedIn: false };
  const [title, sub] = PAGE_TITLES[page] || ["CryptoTracker", ""];

  const handleLogout = async () => {
    await auth.signOut();
  };

  return (
    <>
      <div className="app">
        <Sidebar page={page} onNav={setPage} onLogout={isSignedIn ? handleLogout : undefined} />
        <div className="mainWrap">
          <Topbar title={title} sub={sub} onNav={setPage} />
          <div className="scroll">
            {page === "dashboard" && <DashboardPage />}
            {page === "assets" && <PortfolioPage />}
            {page === "calendar" && <CalendarPage />}
            {page === "ledger" && <LedgerPage />}
            {page === "markets" && <MarketsPage />}
            {page === "vault" && <VaultPage />}
            {page === "settings" && <SettingsPage />}
          </div>
        </div>
      </div>
      {toastMsg && <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div>}
    </>
  );
}

const App = forwardRef<HTMLDivElement, Record<string, never>>(function App(_props, _ref) {
  return (
    <CryptoProvider>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </CryptoProvider>
  );
});

App.displayName = "App";

export default App;
