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

export default function SettingsPage() {
  const { state, setState, toast } = useCrypto();

  return (
    <>
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
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Base Currency</h2></div>
        <div className="panel-body">
          <div className="seg">
            {["USD", "EUR", "GBP", "QAR"].map(c => (
              <button key={c} className={state.base === c ? "active" : ""} onClick={() => setState(p => ({ ...p, base: c }))}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Data</h2></div>
        <div className="panel-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crypto-backup.json"; a.click();
            toast("Exported ✓", "good");
          }}>Export JSON</button>
          <button className="btn secondary" style={{ color: "var(--bad)" }} onClick={() => {
            if (confirm("Clear ALL data?")) { setState(() => ({ ...state, txs: [], lots: [], holdings: [] })); toast("Cleared", "bad"); }
          }}>Clear Data</button>
        </div>
      </div>
    </>
  );
}
