import { forwardRef, useState, useEffect } from "react";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import { supabase } from "@/integrations/supabase/client";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import LedgerPage from "@/pages/LedgerPage";
import CalendarPage from "@/pages/CalendarPage";
import MarketsPage from "@/pages/MarketsPage";
import SettingsPage from "@/pages/SettingsPage";
import VaultPage from "@/pages/VaultPage";
import AuthPage from "@/pages/AuthPage";

const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs · Allocation · Heatmap"],
  assets: ["Assets", "Positions · P&L · Lots"],
  calendar: ["Calendar", "Daily P&L · Per Coin"],
  ledger: ["Ledger", "Journal · Import · Manual Entry"],
  markets: ["Live Markets", "Bubbles · Prices · Watchlist"],
  vault: ["Vault", "Snapshots · Backups · Export"],
  settings: ["Settings", "Layout · Themes · Data"],
};

function AppShell() {
  const [page, setPage] = useState("dashboard");
  const [authState, setAuthState] = useState<"loading" | "auth" | "guest">("loading");
  const { toastMsg } = useCrypto();
  const [title, sub] = PAGE_TITLES[page] || ["CryptoTracker", ""];

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? "auth" : "guest");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState(session ? "auth" : "guest");
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthState("guest");
  };

  if (authState === "loading") {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)", color: "var(--muted)" }}>Loading…</div>;
  }

  if (authState === "guest") {
    return <AuthPage onAuth={() => setAuthState("auth")} />;
  }

  return (
    <>
      <div className="app">
        <Sidebar page={page} onNav={setPage} onLogout={handleLogout} />
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
      <AppShell />
    </CryptoProvider>
  );
});

App.displayName = "App";

export default App;
