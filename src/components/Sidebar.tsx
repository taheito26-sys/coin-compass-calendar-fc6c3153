import { useCrypto } from "@/lib/cryptoContext";

const pages = [
  { id: "tracker", label: "Tracker", sub: "Live · FIFO/DCA", icon: "M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 2h10M7 11h6M7 15h8" },
  { id: "dashboard", label: "Dashboard", sub: "KPIs · trend", icon: "M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-11h7V4h-7v5Z" },
  { id: "portfolio", label: "Portfolio", sub: "Positions", icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" },
  { id: "ledger", label: "Ledger", sub: "Journal", icon: "M7 4h10M7 8h10M7 12h10M7 16h10M7 20h10" },
  { id: "import", label: "Import", sub: "CSV · Exchanges", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" },
  { id: "user", label: "User", sub: "Holdings · DCA", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" },
  { id: "calendar", label: "Calendar", sub: "Daily P&L", icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" },
  { id: "markets", label: "Markets", sub: "Watchlist", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { id: "alerts", label: "Alerts", sub: "Price alerts", icon: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" },
  { id: "settings", label: "Settings", sub: "Layout · themes", icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L13 3h-4l-.9 2.9a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L4 13a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h4l.9-2.9a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6Z" },
];

export default function Sidebar({ page, onNav }: { page: string; onNav: (p: string) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5c4.7 0 8.5 3.8 8.5 8.5S16.7 19.5 12 19.5 3.5 15.7 3.5 11 7.3 2.5 12 2.5Z" stroke="rgba(255,255,255,.9)" strokeWidth="1.5"/><path d="M7 12h10M12 7v10" stroke="rgba(255,255,255,.9)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div>
          <div className="brand-name">CryptoTracker</div>
          <div className="brand-ver">v1 · Portfolio</div>
        </div>
      </div>
      <nav className="nav">
        {pages.map(p => (
          <button key={p.id} className={`navBtn${page === p.id ? " active" : ""}`} onClick={() => onNav(p.id)}>
            <svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div><div>{p.label}</div><small>{p.sub}</small></div>
          </button>
        ))}
      </nav>
    </aside>
  );
}
