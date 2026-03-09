import { useCrypto } from "@/lib/cryptoContext";
import { uid, fmtFiat, fmtPx, cryptoDerived, cnum } from "@/lib/cryptoState";
import { useState } from "react";

type AlertType = "price_above" | "price_below";
type NotifyChannel = "browser" | "email" | "telegram";

interface AlertHistoryEntry {
  alertId: string;
  sym: string;
  type: string;
  threshold: number;
  triggeredAt: number;
  price: number;
}

export default function AlertsPage() {
  const { state, setState, toast } = useCrypto();
  const alerts = state.alerts || [];
  const [tab, setTab] = useState<"active" | "history" | "channels">("active");
  const [editId, setEditId] = useState<string | null>(null);
  const [editSym, setEditSym] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [editType, setEditType] = useState<AlertType>("price_above");

  // Alert history (stored in state, simulated)
  const history: AlertHistoryEntry[] = (state as any).alertHistory || [];

  const addAlert = () => {
    const d = cryptoDerived(state);
    const sym = d.rows[0]?.sym || "BTC";
    setState(prev => ({
      ...prev,
      alerts: [{ id: uid(), type: "price_above", sym, threshold: 100000, active: true, createdAt: Date.now(), triggeredAt: null }, ...prev.alerts]
    }));
    toast("Alert added — edit threshold", "good");
  };

  const startEdit = (a: any) => {
    setEditId(a.id);
    setEditSym(a.sym || "");
    setEditThreshold(String(a.threshold));
    setEditType(a.type || "price_above");
  };

  const saveEdit = () => {
    if (!editId) return;
    setState(p => ({
      ...p,
      alerts: p.alerts.map(a => a.id === editId ? { ...a, sym: editSym.toUpperCase(), threshold: parseFloat(editThreshold) || 0, type: editType } : a)
    }));
    setEditId(null);
    toast("Alert updated", "good");
  };

  const tabs: { key: typeof tab; label: string; icon: string }[] = [
    { key: "active", label: "Active Alerts", icon: "🔔" },
    { key: "history", label: "Alert History", icon: "📋" },
    { key: "channels", label: "Notification Channels", icon: "📡" },
  ];

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>Alerts</h2>
          <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>Price alerts, notification channels, trigger history</p>
        </div>
        <button className="btn" onClick={addAlert}>+ Add Alert</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key}
            style={{ fontSize: 11, padding: "5px 12px", cursor: "pointer", background: tab === t.key ? "var(--brand)" : "var(--panel2)", color: tab === t.key ? "#fff" : "var(--muted)", border: "none", borderRadius: 6, fontWeight: 600 }}
            onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ACTIVE ALERTS */}
      {tab === "active" && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Price Alerts</div><span className="pill">{alerts.length} total</span></div>
          <div className="panel-body">
            <div className="tableWrap"><table>
              <thead><tr><th>Type</th><th>Symbol</th><th style={{ textAlign: "right" }}>Threshold</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {alerts.length ? alerts.map(a => (
                  editId === a.id ? (
                    <tr key={a.id} style={{ background: "var(--brand3)" }}>
                      <td>
                        <select className="inp" value={editType} onChange={e => setEditType(e.target.value as AlertType)} style={{ fontSize: 11, padding: 4 }}>
                          <option value="price_above">PRICE ABOVE</option>
                          <option value="price_below">PRICE BELOW</option>
                        </select>
                      </td>
                      <td><input className="inp" value={editSym} onChange={e => setEditSym(e.target.value)} style={{ width: 60, fontSize: 11, padding: 4 }} /></td>
                      <td style={{ textAlign: "right" }}><input className="inp" value={editThreshold} onChange={e => setEditThreshold(e.target.value)} style={{ width: 90, fontSize: 11, padding: 4, textAlign: "right" }} /></td>
                      <td></td>
                      <td style={{ textAlign: "right", display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button className="btn tiny" onClick={saveEdit}>Save</button>
                        <button className="btn tiny secondary" onClick={() => setEditId(null)}>Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 900 }}>{(a.type || "").replace("_", " ").toUpperCase()}</td>
                      <td>{a.sym || "—"}</td>
                      <td style={{ textAlign: "right" }}>{fmtPx(a.threshold)} {state.base}</td>
                      <td>{a.active ? <span className="pill good">Active</span> : <span className="pill">Disabled</span>}</td>
                      <td style={{ textAlign: "right", display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button className="btn tiny secondary" onClick={() => startEdit(a)}>Edit</button>
                        <button className="btn tiny secondary" onClick={() => setState(p => ({ ...p, alerts: p.alerts.map(x => x.id === a.id ? { ...x, active: !x.active } : x) }))}>
                          {a.active ? "Disable" : "Enable"}
                        </button>
                        <button className="btn tiny secondary" onClick={() => setState(p => ({ ...p, alerts: p.alerts.filter(x => x.id !== a.id) }))}>Del</button>
                      </td>
                    </tr>
                  )
                )) : <tr><td colSpan={5} className="muted">No alerts yet. Click "+ Add Alert" to get started.</td></tr>}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Trigger History</div><span className="pill">{history.length} events</span></div>
          <div className="panel-body">
            {history.length ? (
              <div className="tableWrap"><table>
                <thead><tr><th>Symbol</th><th>Type</th><th style={{ textAlign: "right" }}>Threshold</th><th style={{ textAlign: "right" }}>Price at Trigger</th><th>Time</th></tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{h.sym}</td>
                      <td>{h.type.replace("_", " ").toUpperCase()}</td>
                      <td style={{ textAlign: "right" }}>{fmtPx(h.threshold)}</td>
                      <td style={{ textAlign: "right" }}>{fmtPx(h.price)}</td>
                      <td>{new Date(h.triggeredAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : (
              <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
                No alerts have triggered yet. When a price crosses your threshold, it will appear here.
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHANNELS */}
      {tab === "channels" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {[
            { id: "browser" as NotifyChannel, icon: "🌐", name: "Browser Notifications", desc: "Push notifications in your browser", status: "Active", connected: true },
            { id: "email" as NotifyChannel, icon: "📧", name: "Email", desc: "Receive alerts via email", status: "Coming Soon", connected: false },
            { id: "telegram" as NotifyChannel, icon: "✈️", name: "Telegram Bot", desc: "Get notified via Telegram", status: "Coming Soon", connected: false },
          ].map(ch => (
            <div key={ch.id} className="panel">
              <div className="panel-body" style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 28 }}>{ch.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 2 }}>{ch.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{ch.desc}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`pill ${ch.connected ? "good" : ""}`} style={{ fontSize: 10 }}>{ch.status}</span>
                      {ch.connected ? (
                        <button className="btn tiny secondary" onClick={() => toast("Browser notifications enabled", "good")}>Test</button>
                      ) : (
                        <button className="btn tiny secondary" disabled style={{ opacity: 0.5 }}>Configure</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
