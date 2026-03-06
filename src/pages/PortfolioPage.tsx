import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";

export default function PortfolioPage() {
  const { state } = useCrypto();
  const d = cryptoDerived(state);
  return (
    <>
      <div className="panel">
        <div className="panel-head"><h2>Positions</h2><span className="pill">{d.rows.length} assets</span></div>
        <div className="panel-body">
          <div className="tableWrap"><table>
            <thead><tr><th>Asset</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>MV</th><th>Unreal</th></tr></thead>
            <tbody>
              {d.rows.length ? d.rows.map(r => (
                <tr key={r.sym}>
                  <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                  <td className="mono">{fmtQty(r.qty)}</td>
                  <td className="mono">{fmtPx(r.qty > 0 ? r.cost / r.qty : 0)} {d.base}</td>
                  <td className="mono">{r.price === null ? "—" : fmtPx(r.price) + " " + d.base}</td>
                  <td className="mono">{r.mv === null ? "—" : fmtFiat(r.mv, d.base)}</td>
                  <td className={`mono ${r.unreal === null ? "" : r.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>{r.unreal === null ? "—" : fmtFiat(r.unreal, d.base)}</td>
                </tr>
              )) : <tr><td colSpan={6} className="muted">No positions yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 8 }}>
        <div className="panel-head"><h2>Lots</h2><span className="pill">{state.lots.length} lots</span></div>
        <div className="panel-body">
          <div className="tableWrap"><table>
            <thead><tr><th>Lot</th><th>Asset</th><th>Qty Rem</th><th>Unit Cost</th><th>Acquired</th><th>Tag</th></tr></thead>
            <tbody>
              {state.lots.length ? state.lots.slice().sort((a, b) => a.ts - b.ts).map(l => (
                <tr key={l.id}>
                  <td className="mono">{l.id.slice(0, 12)}</td>
                  <td className="mono" style={{ fontWeight: 900 }}>{l.asset}</td>
                  <td className="mono">{fmtQty(l.qtyRem)}</td>
                  <td className="mono">{fmtPx(l.unitCost)} {state.base}</td>
                  <td className="mono">{new Date(l.ts).toLocaleDateString()}</td>
                  <td className="mono muted">{l.tag}</td>
                </tr>
              )) : <tr><td colSpan={6} className="muted">No lots yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
