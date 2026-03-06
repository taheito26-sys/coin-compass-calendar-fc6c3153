import { useState } from "react";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import LedgerPage from "@/pages/LedgerPage";
import ImportPage from "@/pages/ImportPage";
import UserPage from "@/pages/UserPage";
import CalendarPage from "@/pages/CalendarPage";
import MarketsPage from "@/pages/MarketsPage";
import AlertsPage from "@/pages/AlertsPage";
import SettingsPage from "@/pages/SettingsPage";

const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs · Market Value · Positions"],
  portfolio: ["Portfolio", "Positions · Lots"],
  ledger: ["Ledger", "Transaction Journal"],
  import: ["Import", "CSV · Exchange Trade History"],
  user: ["User Portfolio", "Holdings · DCA · Buy Log"],
  calendar: ["Calendar", "Daily P&L · Per Coin"],
  markets: ["Markets", "Watchlist · Prices"],
  alerts: ["Alerts", "Price & Portfolio Alerts"],
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
          <Topbar title={title} sub={sub} />
          <div className="scroll">
            {page === "dashboard" && <DashboardPage />}
            {page === "portfolio" && <PortfolioPage />}
            {page === "ledger" && <LedgerPage />}
            {page === "import" && <ImportPage />}
            {page === "user" && <UserPage />}
            {page === "calendar" && <CalendarPage />}
            {page === "markets" && <MarketsPage />}
            {page === "alerts" && <AlertsPage />}
            {page === "settings" && <SettingsPage />}
          </div>
        </div>
      </div>
      {toastMsg && <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div>}
    </>
  );
}

export default function App() {
  return (
    <CryptoProvider>
      <AppShell />
    </CryptoProvider>
  );
}
