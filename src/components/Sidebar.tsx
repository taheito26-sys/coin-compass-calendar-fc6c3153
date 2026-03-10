import { useCrypto } from "@/lib/cryptoContext";
import { PAGES } from "@/lib/pageRegistry";

export default function Sidebar({ page, onNav, onLogout }: { page: string; onNav: (p: string) => void; onLogout?: () => void }) {
  const { state } = useCrypto();
  const alertCount = (state.alerts || []).filter(a => a.active).length;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5c4.7 0 8.5 3.8 8.5 8.5S16.7 19.5 12 19.5 3.5 15.7 3.5 11 7.3 2.5 12 2.5Z" stroke="rgba(255,255,255,.9)" strokeWidth="1.5"/><path d="M7 12h10M12 7v10" stroke="rgba(255,255,255,.9)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div>
          <div className="brand-name">CryptoTracker</div>
          <div className="brand-ver">v2 · Portfolio</div>
        </div>
      </div>
      <nav className="nav">
        {PAGES.map(p => (
          <button key={p.id} className={`navBtn${page === p.id ? " active" : ""}`} onClick={() => onNav(p.id)}>
            <svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {p.label}
                {p.id === "settings" && alertCount > 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 900, background: "var(--brand)", color: "#fff",
                    borderRadius: 999, padding: "1px 5px", lineHeight: 1.4,
                  }}>{alertCount}</span>
                )}
              </div>
              <small>{p.sub}</small>
            </div>
          </button>
        ))}
      </nav>
      {onLogout && (
        <div style={{ padding: "8px 12px", marginTop: "auto" }}>
          <button
            className="btn secondary"
            onClick={onLogout}
            style={{ width: "100%", fontSize: 11, padding: "6px 0" }}
          >
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
