import { forwardRef } from "react";
import { useCrypto } from "@/lib/cryptoContext";

const LAYOUTS = [
  { id: "flux", name: "Flux", desc: "Modern SaaS" },
  { id: "cipher", name: "Cipher", desc: "Dark Terminal" },
  { id: "vector", name: "Vector", desc: "Corporate" },
  { id: "aurora", name: "Aurora", desc: "Gradient SaaS" },
  { id: "carbon", name: "Carbon", desc: "Dark Monitor" },
  { id: "prism", name: "Prism", desc: "Bold Fintech" },
  { id: "noir", name: "Noir", desc: "Luxury Dark" },
  { id: "pulse", name: "Pulse", desc: "Neon Crypto" },
];
const THEMES = ["t1", "t2", "t3", "t4", "t5"];
const METHODS = ["FIFO", "DCA"];
const CURRENCIES = ["USD", "EUR", "GBP", "QAR"];
const TIMEZONES = [
  { id: "local", name: "Local (Browser)" },
  { id: "UTC", name: "UTC" },
  { id: "America/New_York", name: "US Eastern" },
  { id: "America/Chicago", name: "US Central" },
  { id: "America/Los_Angeles", name: "US Pacific" },
  { id: "Europe/London", name: "London" },
  { id: "Europe/Berlin", name: "Berlin" },
  { id: "Asia/Tokyo", name: "Tokyo" },
  { id: "Asia/Shanghai", name: "Shanghai" },
  { id: "Asia/Dubai", name: "Dubai" },
  { id: "Asia/Qatar", name: "Qatar" },
];
const NUMBER_FORMATS = [
  { id: "default", name: "1,234.56 (US/UK)" },
  { id: "eu", name: "1.234,56 (EU)" },
  { id: "compact", name: "1.23K (Compact)" },
];
const REFRESH_INTERVALS = [
  { id: "60", name: "1 minute" },
  { id: "120", name: "2 minutes" },
  { id: "300", name: "5 minutes" },
  { id: "600", name: "10 minutes" },
];

const SettingsPage = forwardRef<HTMLDivElement, Record<string, never>>(function SettingsPage(_props, _ref) {
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

      {/* Display Preferences */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Display Preferences</h2></div>
        <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-field">
            <label className="form-label">Timezone</label>
            <select
              className="inp"
              value={(state as any).timezone || "local"}
              onChange={e => { setState(p => ({ ...p, timezone: e.target.value } as any)); toast("Timezone updated", "good"); }}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.id} value={tz.id}>{tz.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Number Format</label>
            <select
              className="inp"
              value={(state as any).numberFormat || "default"}
              onChange={e => { setState(p => ({ ...p, numberFormat: e.target.value } as any)); toast("Number format updated", "good"); }}
            >
              {NUMBER_FORMATS.map(nf => (
                <option key={nf.id} value={nf.id}>{nf.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Data Refresh Interval</label>
            <select
              className="inp"
              value={(state as any).refreshInterval || "120"}
              onChange={e => { setState(p => ({ ...p, refreshInterval: e.target.value } as any)); toast("Refresh interval updated", "good"); }}
            >
              {REFRESH_INTERVALS.map(ri => (
                <option key={ri.id} value={ri.id}>{ri.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Notifications</h2></div>
        <div className="panel-body">
          <div className="tog-wrap" onClick={() => setState(p => ({ ...p, notifyAlerts: !(p as any).notifyAlerts } as any))}>
            <span className="tog-lbl">Price alert notifications</span>
            <div className="tog-switch">
              <input type="checkbox" checked={(state as any).notifyAlerts ?? true} readOnly />
              <span className="tog-track" />
            </div>
          </div>
          <div className="tog-wrap" onClick={() => setState(p => ({ ...p, notifyImports: !(p as any).notifyImports } as any))}>
            <span className="tog-lbl">Import completion notifications</span>
            <div className="tog-switch">
              <input type="checkbox" checked={(state as any).notifyImports ?? true} readOnly />
              <span className="tog-track" />
            </div>
          </div>
          <div className="tog-wrap" onClick={() => setState(p => ({ ...p, notifySync: !(p as any).notifySync } as any))}>
            <span className="tog-lbl">Sync status notifications</span>
            <div className="tog-switch">
              <input type="checkbox" checked={(state as any).notifySync ?? false} readOnly />
              <span className="tog-track" />
            </div>
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
});

SettingsPage.displayName = "SettingsPage";

export default SettingsPage;
