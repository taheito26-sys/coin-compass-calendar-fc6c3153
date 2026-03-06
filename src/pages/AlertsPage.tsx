import { useCrypto } from "@/lib/cryptoContext";
import { uid, fmtFiat, fmtPx, cryptoDerived, cnum } from "@/lib/cryptoState";

export default function AlertsPage() {
  const { state, setState, toast } = useCrypto();
  const alerts = state.alerts || [];

  const addAlert = () => {
    const d = cryptoDerived(state);
    const sym = d.rows[0]?.sym || "BTC";
    setState(prev => ({
      ...prev,
      alerts: [{ id: uid(), type: "price_above", sym, threshold: 100000, active: true, createdAt: Date.now(), triggeredAt: null }, ...prev.alerts]
    }));
    toast("Alert added — edit threshold", "good");
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button className="btn" onClick={addAlert}>+ Add Alert</button>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Alerts</div><span className="pill">local engine</span></div>
        <div className="panel-body">
          <div className="tableWrap"><table>
            <thead><tr><th>Type</th><th>Symbol</th><th style={{ textAlign: "right" }}>Threshold</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {alerts.length ? alerts.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 900 }}>{a.type.replace("_", " ").toUpperCase()}</td>
                  <td>{a.sym || "—"}</td>
                  <td style={{ textAlign: "right" }}>{fmtPx(a.threshold)} {state.base}</td>
                  <td>{a.active ? <span className="pill good">Active</span> : <span className="pill">Disabled</span>}</td>
                  <td style={{ textAlign: "right", display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn tiny secondary" onClick={() => setState(p => ({ ...p, alerts: p.alerts.map(x => x.id === a.id ? { ...x, active: !x.active } : x) }))}>
                      {a.active ? "Disable" : "Enable"}
                    </button>
                    <button className="btn tiny secondary" onClick={() => setState(p => ({ ...p, alerts: p.alerts.filter(x => x.id !== a.id) }))}>Del</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="muted">No alerts yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
