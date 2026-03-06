import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";

export default function DashboardPage() {
  const { state, refresh } = useCrypto();
  const d = cryptoDerived(state);
  const age = d.priceAgeMs < 60000 ? Math.round(d.priceAgeMs / 1000) + "s" : Math.round(d.priceAgeMs / 60000) + "m";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn secondary" onClick={() => refresh(true)} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
        <span className="pill">Prices: {age} ago</span>
        <span className="pill">{d.base}</span>
      </div>
      <div className="kpis">
        <div className="kpi-card">
          <div className="kpi-head"><span className="kpi-badge" style={{ color: "var(--brand)", borderColor: "color-mix(in srgb,var(--brand) 30%,transparent)", background: "var(--brand3)" }}>{d.base}</span></div>
          <div className="kpi-lbl">MARKET VALUE</div>
          <div className="kpi-val">{fmtFiat(d.pricedMV, d.base)}</div>
          <div className="kpi-sub">{d.rows.length} assets tracked</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head"><span className={`kpi-badge ${d.unreal >= 0 ? "good" : "bad"}`}>{d.unreal >= 0 ? "▲" : "▼"}</span></div>
          <div className="kpi-lbl">UNREALIZED P&L</div>
          <div className={`kpi-val ${d.unreal >= 0 ? "good" : "bad"}`}>{(d.unreal >= 0 ? "+" : "") + fmtFiat(d.unreal, d.base)}</div>
          <div className="kpi-sub">vs cost basis</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">TOTAL COST</div>
          <div className="kpi-val">{fmtFiat(d.totalCost, d.base)}</div>
          <div className="kpi-sub">{state.lots.length} lots</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">METHOD</div>
          <div className="kpi-val" style={{ fontSize: 16 }}>{state.method}</div>
          <div className="kpi-sub">{d.unpriced.length > 0 ? `⚠ ${d.unpriced.length} unpriced` : "Data OK"}</div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Top Positions</h2><span className="pill">{d.rows.length} assets</span></div>
        <div className="panel-body">
          <div className="tableWrap">
            <table>
              <thead><tr><th>Asset</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>MV</th><th>Unreal</th></tr></thead>
              <tbody>
                {d.rows.length ? d.rows.map(r => {
                  const avg = r.qty > 0 ? r.cost / r.qty : 0;
                  return (
                    <tr key={r.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                      <td className="mono">{fmtQty(r.qty)}</td>
                      <td className="mono">{fmtPx(avg)} {d.base}</td>
                      <td className="mono">{r.price === null ? "—" : fmtPx(r.price) + " " + d.base}</td>
                      <td className="mono">{r.mv === null ? "—" : fmtFiat(r.mv, d.base)}</td>
                      <td className={`mono ${r.unreal === null ? "" : r.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                        {r.unreal === null ? "—" : fmtFiat(r.unreal, d.base)}
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={6} className="muted">No positions yet. Add transactions in Ledger or holdings in User.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
