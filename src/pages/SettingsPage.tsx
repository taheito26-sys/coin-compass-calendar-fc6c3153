import { useCrypto } from "@/lib/cryptoContext";

const LAYOUTS = [
  { id: "flux", name: "Flux", desc: "Modern SaaS" },
  { id: "cipher", name: "Cipher", desc: "Dark Terminal" },
  { id: "vector", name: "Vector", desc: "Corporate" },
  { id: "aurora", name: "Aurora", desc: "Gradient SaaS" },
  { id: "carbon", name: "Carbon", desc: "Dark Monitor" },
  { id: "prism", name: "Prism", desc: "Bold Fintech" },
  { id: "noir", name: "Noir", desc: "Luxury Dark" },
];
const THEMES = ["t1", "t2", "t3", "t4", "t5"];
const METHODS = ["FIFO", "DCA"];
const CURRENCIES = ["USD", "EUR", "GBP", "QAR"];

export default function SettingsPage() {
  const { state, setState, toast } = useCrypto();

  return (
    <>
      {/* Layout Templates */}
      <div className="panel">
        <div className="panel-head"><h2>Layout Templates</h2></div>
        <div className="panel-body">
          <div className="lt-grid">
            {LAYOUTS.map(l => (
              <div key={l.id} className={`lt-card${state.layout === l.id ? " active" : ""}`} onClick={() => { setState(p => ({ ...p, layout: l.id })); toast("Layout: " + l.name, "good"); }}>
                <div className="lt-name">{l.name}</div>
                <div className="lt-desc">{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Theme Colors */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Theme Colors</h2></div>
        <div className="panel-body">
          <div className="theme-colors">
            {THEMES.map(t => (
              <div key={t} className={`tc-btn${state.theme === t ? " active" : ""}`} onClick={() => { setState(p => ({ ...p, theme: t })); toast("Theme: " + t, "good"); }}>
                <div className="tc-name">Theme {t.slice(1)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tracking Method */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Tracking Method</h2></div>
        <div className="panel-body">
          <div className="seg">
            {METHODS.map(m => (
              <button key={m} className={state.method === m ? "active" : ""} onClick={() => { setState(p => ({ ...p, method: m })); toast("Method: " + m, "good"); }}>{m}</button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
            FIFO: First-In-First-Out lot matching. DCA: Dollar Cost Average position tracking.
          </p>
        </div>
      </div>

      {/* Base Currency */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Base Currency</h2></div>
        <div className="panel-body">
          <div className="seg">
            {CURRENCIES.map(c => (
              <button key={c} className={state.base === c ? "active" : ""} onClick={() => setState(p => ({ ...p, base: c }))}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Data Management</h2></div>
        <div className="panel-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crypto-backup.json"; a.click();
            toast("Exported ✓", "good");
          }}>📥 Export JSON Backup</button>
          <button className="btn secondary" onClick={() => {
            const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
            inp.onchange = async () => {
              const file = inp.files?.[0]; if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                setState(() => data);
                toast("Restored from backup ✓", "good");
              } catch { toast("Invalid backup file", "bad"); }
            };
            inp.click();
          }}>📤 Import JSON Backup</button>
          <button className="btn danger" onClick={() => {
            if (confirm("Clear ALL transactions, lots, and holdings? This cannot be undone.")) {
              setState(p => ({ ...p, txs: [], lots: [], holdings: [], importedFiles: [], calendarEntries: [] }));
              toast("All data cleared", "bad");
            }
          }}>🗑 Clear All Data</button>
        </div>
      </div>

      {/* Stats */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Data Stats</h2></div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <div className="cal-stat"><div className="kpi-lbl">Transactions</div><div className="kpi-val">{state.txs.length}</div></div>
            <div className="cal-stat"><div className="kpi-lbl">Lots</div><div className="kpi-val">{state.lots.length}</div></div>
            <div className="cal-stat"><div className="kpi-lbl">Holdings</div><div className="kpi-val">{state.holdings.length}</div></div>
            <div className="cal-stat"><div className="kpi-lbl">Imports</div><div className="kpi-val">{(state.importedFiles || []).length}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
