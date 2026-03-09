import { forwardRef, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";

// ── Layout & theme metadata ───────────────────────────────────────────────

const LAYOUTS = [
  { id: "flux",   name: "Flux",   desc: "Modern SaaS",    font: "Inter" },
  { id: "cipher", name: "Cipher", desc: "Dark Terminal",  font: "JetBrains Mono" },
  { id: "vector", name: "Vector", desc: "Corporate",      font: "Plus Jakarta Sans" },
  { id: "aurora", name: "Aurora", desc: "Gradient SaaS",  font: "Plus Jakarta Sans" },
  { id: "carbon", name: "Carbon", desc: "Dark Monitor",   font: "JetBrains Mono" },
  { id: "prism",  name: "Prism",  desc: "Bold Fintech",   font: "Space Grotesk" },
  { id: "noir",   name: "Noir",   desc: "Luxury Dark",    font: "Inter" },
  { id: "pulse",  name: "Pulse",  desc: "Neon Crypto",    font: "DM Sans" },
];

/** Color swatches per layout+theme for visual preview */
const THEME_COLORS: Record<string, Record<string, { brand: string; brand2: string; bg: string; panel: string; text: string; good: string; bad: string }>> = {
  flux: {
    t1: { brand: "#4f46e5", brand2: "#7c3aed", bg: "#f8faff", panel: "#ffffff", text: "#0f172a", good: "#16a34a", bad: "#dc2626" },
    t2: { brand: "#0d9488", brand2: "#059669", bg: "#f0fdf9", panel: "#ffffff", text: "#0f2922", good: "#15803d", bad: "#dc2626" },
    t3: { brand: "#e11d48", brand2: "#db2777", bg: "#fff1f5", panel: "#ffffff", text: "#2d0014", good: "#15803d", bad: "#b91c1c" },
    t4: { brand: "#d97706", brand2: "#b45309", bg: "#fffbf0", panel: "#ffffff", text: "#1c1400", good: "#15803d", bad: "#dc2626" },
    t5: { brand: "#334155", brand2: "#1e293b", bg: "#f8fafc", panel: "#ffffff", text: "#0f172a", good: "#15803d", bad: "#dc2626" },
  },
  cipher: {
    t1: { brand: "#00ff64", brand2: "#00cc50", bg: "#000000", panel: "#0a0a0a", text: "#e0ffd4", good: "#00ff64", bad: "#ff4040" },
    t2: { brand: "#0096ff", brand2: "#0064cc", bg: "#000b1a", panel: "#001428", text: "#b8d8ff", good: "#00d4aa", bad: "#ff4455" },
    t3: { brand: "#aa44ff", brand2: "#8800ee", bg: "#0d0015", panel: "#150022", text: "#e8ccff", good: "#44ff88", bad: "#ff4466" },
    t4: { brand: "#ff8c00", brand2: "#ff6600", bg: "#1a0800", panel: "#260c00", text: "#ffd4a0", good: "#44ff88", bad: "#ff3300" },
    t5: { brand: "#6478ff", brand2: "#4455ee", bg: "#0a0a14", panel: "#10101e", text: "#c8d0ff", good: "#44ffaa", bad: "#ff5566" },
  },
  vector: {
    t1: { brand: "#1363df", brand2: "#0a4cbc", bg: "#f0f4f8", panel: "#ffffff", text: "#1a2b3d", good: "#0d7e38", bad: "#c0392b" },
    t2: { brand: "#0f62fe", brand2: "#0043ce", bg: "#f4f4f4", panel: "#ffffff", text: "#161616", good: "#198038", bad: "#da1e28" },
    t3: { brand: "#2d6a00", brand2: "#1a4800", bg: "#f5f5f0", panel: "#ffffff", text: "#1e1e14", good: "#2d6a00", bad: "#c42b1c" },
    t4: { brand: "#7c3aed", brand2: "#5b21b6", bg: "#fafafa", panel: "#ffffff", text: "#18181b", good: "#15803d", bad: "#be123c" },
    t5: { brand: "#ea580c", brand2: "#c2410c", bg: "#fff9f5", panel: "#ffffff", text: "#1c0a00", good: "#15803d", bad: "#dc2626" },
  },
  aurora: {
    t1: { brand: "#5b21b6", brand2: "#4c1d95", bg: "#f5f4ff", panel: "#ffffff", text: "#1a1040", good: "#059669", bad: "#dc2626" },
    t2: { brand: "#059669", brand2: "#047857", bg: "#f0fdf7", panel: "#ffffff", text: "#0a2418", good: "#16a34a", bad: "#dc2626" },
    t3: { brand: "#e84226", brand2: "#c93119", bg: "#fff5f2", panel: "#ffffff", text: "#3d0c00", good: "#059669", bad: "#b91c1c" },
    t4: { brand: "#9333ea", brand2: "#7e22ce", bg: "#fdf4ff", panel: "#ffffff", text: "#2e0040", good: "#059669", bad: "#dc2626" },
    t5: { brand: "#0284c7", brand2: "#0369a1", bg: "#f0f8ff", panel: "#ffffff", text: "#062040", good: "#059669", bad: "#dc2626" },
  },
  carbon: {
    t1: { brand: "#f59e0b", brand2: "#d97706", bg: "#0e0d0b", panel: "#161410", text: "#f5e8c0", good: "#4ade80", bad: "#f87171" },
    t2: { brand: "#22d3ee", brand2: "#06b6d4", bg: "#070d10", panel: "#0e1520", text: "#b8e8f8", good: "#4ade80", bad: "#f87171" },
    t3: { brand: "#84cc16", brand2: "#65a30d", bg: "#060c04", panel: "#0c1408", text: "#c8f0a8", good: "#4ade80", bad: "#f87171" },
    t4: { brand: "#ec4899", brand2: "#db2777", bg: "#0d050c", panel: "#180c18", text: "#f8c8f0", good: "#4ade80", bad: "#f87171" },
    t5: { brand: "#f97316", brand2: "#ea580c", bg: "#0e0800", panel: "#171008", text: "#f8d8a0", good: "#4ade80", bad: "#f87171" },
  },
  prism: {
    t1: { brand: "#1c2a8c", brand2: "#3b4ec8", bg: "#f4f6ff", panel: "#ffffff", text: "#0c1240", good: "#166534", bad: "#991b1b" },
    t2: { brand: "#991b1b", brand2: "#dc2626", bg: "#fff5f5", panel: "#ffffff", text: "#200808", good: "#166534", bad: "#7f1d1d" },
    t3: { brand: "#14532d", brand2: "#166534", bg: "#f3f8f2", panel: "#ffffff", text: "#0a1e08", good: "#14532d", bad: "#991b1b" },
    t4: { brand: "#a16207", brand2: "#ca8a04", bg: "#fffbeb", panel: "#ffffff", text: "#1c0e00", good: "#166534", bad: "#991b1b" },
    t5: { brand: "#0f172a", brand2: "#1e293b", bg: "#f8fafc", panel: "#ffffff", text: "#0f172a", good: "#166534", bad: "#991b1b" },
  },
  noir: {
    t1: { brand: "#d4af37", brand2: "#b8960c", bg: "#0a0800", panel: "#111006", text: "#f5e8c0", good: "#4ade80", bad: "#f87171" },
    t2: { brand: "#90adc4", brand2: "#7090a8", bg: "#0a0c0e", panel: "#131618", text: "#dce8f0", good: "#4ade80", bad: "#f87171" },
    t3: { brand: "#e04040", brand2: "#c02828", bg: "#0c0404", panel: "#160808", text: "#f0d0d0", good: "#4ade80", bad: "#f87171" },
    t4: { brand: "#2563eb", brand2: "#1d4ed8", bg: "#040810", panel: "#080e1a", text: "#c8d8f8", good: "#4ade80", bad: "#f87171" },
    t5: { brand: "#16a34a", brand2: "#15803d", bg: "#020c06", panel: "#081408", text: "#c0f0d0", good: "#4ade80", bad: "#f87171" },
  },
  pulse: {
    t1: { brand: "#27e0a3", brand2: "#2bb8ff", bg: "#071018", panel: "#0b141f", text: "#edf6ff", good: "#27e0a3", bad: "#ff627e" },
    t2: { brand: "#8b7bff", brand2: "#6e5cff", bg: "#090b16", panel: "#0f101e", text: "#f3f4ff", good: "#3fe0a5", bad: "#ff627e" },
    t3: { brand: "#2bb8ff", brand2: "#0e90ff", bg: "#061220", panel: "#0a1828", text: "#ebf6ff", good: "#27e0a3", bad: "#ff627e" },
    t4: { brand: "#27e0a3", brand2: "#06b676", bg: "#07150f", panel: "#091612", text: "#effff7", good: "#27e0a3", bad: "#ff627e" },
    t5: { brand: "#ffb84d", brand2: "#ff8a3d", bg: "#15110a", panel: "#1b150d", text: "#fff7ea", good: "#42e1a7", bad: "#ff6b6b" },
  },
};

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

  const currentLayoutColors = useMemo(() => {
    return THEME_COLORS[state.layout] || THEME_COLORS.flux;
  }, [state.layout]);

  return (
    <>
      {/* Layout Templates */}
      <div className="panel">
        <div className="panel-head"><h2>Layout Templates</h2></div>
        <div className="panel-body">
          <div className="lt-grid">
            {LAYOUTS.map(l => {
              const colors = THEME_COLORS[l.id]?.[state.theme] || THEME_COLORS[l.id]?.t1;
              return (
                <div
                  key={l.id}
                  className={`lt-card${state.layout === l.id ? " active" : ""}`}
                  onClick={() => { setState(p => ({ ...p, layout: l.id })); toast("Layout: " + l.name, "good"); }}
                >
                  {/* Mini preview */}
                  <div style={{
                    height: 48, borderRadius: 4, marginBottom: 8, overflow: "hidden",
                    background: colors.bg, border: "1px solid " + colors.brand + "22",
                    display: "flex", gap: 2, padding: 4,
                  }}>
                    {/* Sidebar mini */}
                    <div style={{
                      width: 12, borderRadius: 2,
                      background: colors.panel,
                      display: "flex", flexDirection: "column", gap: 2, padding: 2,
                    }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{ height: 3, borderRadius: 1, background: colors.brand, opacity: i === 0 ? 1 : 0.3 }} />
                      ))}
                    </div>
                    {/* Content mini */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ height: 6, borderRadius: 1, background: colors.panel, opacity: 0.8 }} />
                      <div style={{ flex: 1, display: "flex", gap: 2 }}>
                        <div style={{ flex: 1, borderRadius: 2, background: colors.brand, opacity: 0.2 }} />
                        <div style={{ flex: 1, borderRadius: 2, background: colors.brand2, opacity: 0.15 }} />
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        <div style={{ flex: 2, height: 10, borderRadius: 2, background: colors.panel }} />
                        <div style={{ flex: 1, height: 10, borderRadius: 2, background: colors.panel }} />
                      </div>
                    </div>
                  </div>
                  <div className="lt-name">{l.name}</div>
                  <div className="lt-desc">{l.desc}</div>
                  <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 2 }}>{l.font}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Theme Colors */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Theme Colors</h2></div>
        <div className="panel-body">
          <div className="theme-colors">
            {THEMES.map(t => {
              const colors = currentLayoutColors[t];
              if (!colors) return null;
              return (
                <div
                  key={t}
                  className={`tc-btn${state.theme === t ? " active" : ""}`}
                  onClick={() => { setState(p => ({ ...p, theme: t })); toast("Theme: " + t, "good"); }}
                >
                  {/* Color swatches */}
                  <div className="tc-swatch-row">
                    <div className="tc-sw" style={{ background: colors.brand }} />
                    <div className="tc-sw" style={{ background: colors.brand2 }} />
                    <div className="tc-sw" style={{ background: colors.good }} />
                    <div className="tc-sw" style={{ background: colors.bad }} />
                  </div>
                  {/* Mini bar preview */}
                  <div style={{
                    width: "100%", height: 18, borderRadius: 3, overflow: "hidden",
                    background: colors.bg, border: "1px solid " + colors.brand + "33",
                    display: "flex", alignItems: "center", gap: 3, padding: "2px 4px",
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.brand }} />
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: colors.brand, opacity: 0.4 }} />
                    <div style={{ width: 8, height: 3, borderRadius: 2, background: colors.good }} />
                  </div>
                  <div className="tc-name" style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: colors.text }}>
                    Theme {t.slice(1)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tracking + Currency side by side */}
      <div className="settings-row" style={{ marginTop: 10 }}>
        {/* Tracking Method */}
        <div className="panel">
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
        <div className="panel">
          <div className="panel-head"><h2>Base Currency</h2></div>
          <div className="panel-body">
            <div className="seg">
              {CURRENCIES.map(c => (
                <button key={c} className={state.base === c ? "active" : ""} onClick={() => setState(p => ({ ...p, base: c }))}>{c}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Display Preferences */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Display Preferences</h2></div>
        <div className="panel-body">
          <div className="settings-prefs-grid">
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

      {/* Data Management + Stats side by side */}
      <div className="settings-row" style={{ marginTop: 10 }}>
        <div className="panel">
          <div className="panel-head"><h2>Data Management</h2></div>
          <div className="panel-body">
            <div className="vault-actions-grid">
              <button className="btn secondary" onClick={() => {
                const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crypto-backup.json"; a.click();
                toast("Exported ✓", "good");
              }}>📥 Export Backup</button>
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
              }}>📤 Import Backup</button>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <button className="btn danger" onClick={() => {
                if (confirm("Clear ALL transactions, lots, and holdings? This cannot be undone.")) {
                  setState(p => ({ ...p, txs: [], lots: [], holdings: [], importedFiles: [], calendarEntries: [] }));
                  toast("All data cleared", "bad");
                }
              }}>🗑 Clear All Data</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Data Stats</h2></div>
          <div className="panel-body">
            <div className="vault-stats">
              <div className="cal-stat"><div className="kpi-lbl">Transactions</div><div className="kpi-val">{state.txs.length}</div></div>
              <div className="cal-stat"><div className="kpi-lbl">Lots</div><div className="kpi-val">{state.lots.length}</div></div>
              <div className="cal-stat"><div className="kpi-lbl">Holdings</div><div className="kpi-val">{state.holdings.length}</div></div>
              <div className="cal-stat"><div className="kpi-lbl">Imports</div><div className="kpi-val">{(state.importedFiles || []).length}</div></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

SettingsPage.displayName = "SettingsPage";

export default SettingsPage;
