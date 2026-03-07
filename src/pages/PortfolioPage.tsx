import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx, cryptoPriceOf } from "@/lib/cryptoState";
import { useState } from "react";

export default function PortfolioPage() {
  const { state, refresh } = useCrypto();
  const d = cryptoDerived(state);
  const [sortCol, setSortCol] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pnlMode, setPnlMode] = useState<"unrealized" | "realized">("unrealized");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Compute positions with richer data
  const positions = d.rows.map((r, i) => {
    const avg = r.qty > 0 ? r.cost / r.qty : 0;
    const pnlAbs = r.unreal ?? 0;
    const pnlPct = r.cost > 0 ? (pnlAbs / r.cost) * 100 : 0;
    // Mock 1h/24h/7d changes (real data would come from price_cache)
    const change1h = 0;
    const change24h = 0;
    const change7d = 0;
    return {
      rank: i + 1,
      sym: r.sym,
      qty: r.qty,
      price: r.price,
      avg,
      total: r.mv || 0,
      cost: r.cost,
      pnlAbs,
      pnlPct,
      change1h,
      change24h,
      change7d,
    };
  });

  const sorted = [...positions].sort((a, b) => {
    const m = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "rank": return (a.rank - b.rank) * m;
      case "qty": return (a.qty - b.qty) * m;
      case "price": return ((a.price ?? 0) - (b.price ?? 0)) * m;
      case "total": return (a.total - b.total) * m;
      case "avg": return (a.avg - b.avg) * m;
      case "pnl": return (a.pnlAbs - b.pnlAbs) * m;
      default: return (a.total - b.total) * m;
    }
  });

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  function ChangePill({ val }: { val: number }) {
    if (val === 0) return <span className="mono muted">—</span>;
    const cls = val > 0 ? "good" : "bad";
    return (
      <span className={`mono ${cls}`} style={{ fontWeight: 700, fontSize: 11 }}>
        {val > 0 ? "▲" : "▼"} {Math.abs(val).toFixed(2)}%
      </span>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn secondary" onClick={() => refresh(true)} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
        <div className="seg">
          <button className={pnlMode === "unrealized" ? "active" : ""} onClick={() => setPnlMode("unrealized")}>Unrealized</button>
          <button className={pnlMode === "realized" ? "active" : ""} onClick={() => setPnlMode("realized")}>Realized</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Assets</h2>
          <span className="pill">{sorted.length} positions</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <SortTh col="rank" label="Rank" />
                  <th>Name</th>
                  <th>Amount</th>
                  <th>1h Change</th>
                  <th>24h Change</th>
                  <th>7d Change</th>
                  <SortTh col="price" label="Price" />
                  <SortTh col="total" label="Total" />
                  <SortTh col="avg" label="Avg Buy" />
                  <SortTh col="pnl" label="P/L" />
                </tr>
              </thead>
              <tbody>
                {sorted.length > 0 ? sorted.map(pos => (
                  <tr key={pos.sym}>
                    <td className="mono muted">{pos.rank}</td>
                    <td>
                      <span className="mono" style={{ fontWeight: 900 }}>{pos.sym}</span>
                    </td>
                    <td className="mono">{fmtQty(pos.qty)}</td>
                    <td><ChangePill val={pos.change1h} /></td>
                    <td><ChangePill val={pos.change24h} /></td>
                    <td><ChangePill val={pos.change7d} /></td>
                    <td className="mono">{pos.price !== null ? "$" + fmtPx(pos.price) : "—"}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{fmtFiat(pos.total, d.base)}</td>
                    <td className="mono">{pos.avg > 0 ? "$" + fmtPx(pos.avg) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className={`mono ${pos.pnlAbs >= 0 ? "bad" : "bad"}`} style={{
                        fontWeight: 900,
                        color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)",
                      }}>
                        {(pos.pnlAbs >= 0 ? "" : "-") + "$" + Math.abs(pos.pnlAbs).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: pos.pnlPct >= 0 ? "var(--good)" : "var(--bad)",
                        fontWeight: 600,
                      }}>
                        {pos.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={10} className="muted">No assets. Import trades in the Ledger.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Lots */}
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
