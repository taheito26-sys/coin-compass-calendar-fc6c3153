import { forwardRef, useState } from "react";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import LedgerPage from "@/pages/LedgerPage";
import CalendarPage from "@/pages/CalendarPage";
import MarketsPage from "@/pages/MarketsPage";
import SettingsPage from "@/pages/SettingsPage";

const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs · Allocation · Heatmap"],
  assets: ["Assets", "Positions · P&L · Lots"],
  calendar: ["Calendar", "Daily P&L · Per Coin"],
  ledger: ["Ledger", "Journal · Import · Manual Entry"],
  markets: ["Live Markets", "Bubbles · Prices · Watchlist"],
  settings: ["Settings", "Layout · Themes · Data"],
};

function AppShell() {
  const [page, setPage] = useState("dashboard");
  const { toastMsg } = useCrypto();
  const [title, sub] = PAGE_TITLES[page] || ["CryptoTracker", ""];

  return (
    <>
      <div className="app">
        <Sidebar page={page} onNav={setPage} />
        <div className="mainWrap">
          <Topbar title={title} sub={sub} onNav={setPage} />
          <div className="scroll">
            {page === "dashboard" && <DashboardPage />}
            {page === "assets" && <PortfolioPage />}
            {page === "calendar" && <CalendarPage />}
            {page === "ledger" && <LedgerPage />}
            {page === "markets" && <MarketsPage />}
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
