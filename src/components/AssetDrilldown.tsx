import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx, calcDCA, cryptoPriceOf } from "@/lib/cryptoState";
import { useMemo } from "react";

interface Props {
  sym: string;
  onClose: () => void;
}

export default function AssetDrilldown({ sym, onClose }: Props) {
  const { state } = useCrypto();
  const base = state.base || "USD";

  // DCA info
  const dca = useMemo(() => calcDCA(state.holdings, sym), [state.holdings, sym]);

  // Current price
  const currentPrice = cryptoPriceOf(state, sym);

  // Lots for this asset
  const lots = useMemo(() => {
    return state.lots
      .filter(l => l.asset.toUpperCase() === sym.toUpperCase() && l.qtyRem > 0)
      .sort((a, b) => a.ts - b.ts);
  }, [state.lots, sym]);

  // Transactions for this asset
  const txs = useMemo(() => {
    return state.txs
      .filter(t => t.asset.toUpperCase() === sym.toUpperCase())
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50);
  }, [state.txs, sym]);

  // Realized P&L
  const realizedPnl = useMemo(() => {
    return txs
      .filter(t => t.type === "sell" && typeof (t as any).realized === "number")
      .reduce((sum, t) => sum + ((t as any).realized || 0), 0);
  }, [txs]);

  // Unrealized P&L
  const unrealizedPnl = currentPrice !== null ? (currentPrice - dca.avgPrice) * dca.totalQty : null;
  const unrealizedPct = dca.totalCost > 0 && unrealizedPnl !== null ? (unrealizedPnl / dca.totalCost) * 100 : null;

  return (
    <div className="modalBg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modalHead">
          <h3>{sym} — Asset Detail</h3>
          <button className="btn tiny secondary" onClick={onClose}>✕ Close</button>
        </div>
        <div className="modalBody">
          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
            <div className="cal-stat">
              <div className="kpi-lbl">Holdings</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{fmtQty(dca.totalQty)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Avg Cost</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>${fmtPx(dca.avgPrice)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Current Price</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{currentPrice !== null ? "$" + fmtPx(currentPrice) : "—"}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Market Value</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{currentPrice !== null ? fmtFiat(currentPrice * dca.totalQty, base) : "—"}</div>
            </div>
          </div>

          {/* P&L Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div className="cal-stat">
              <div className="kpi-lbl">Cost Basis</div>
              <div className="kpi-val" style={{ fontSize: 14 }}>{fmtFiat(dca.totalCost, base)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Unrealized P&L</div>
              <div className={`kpi-val ${unrealizedPnl !== null ? (unrealizedPnl >= 0 ? "good" : "bad") : ""}`} style={{ fontSize: 14 }}>
                {unrealizedPnl !== null ? (unrealizedPnl >= 0 ? "+" : "") + fmtFiat(unrealizedPnl, base) : "—"}
                {unrealizedPct !== null && <span style={{ fontSize: 10, marginLeft: 4 }}>({unrealizedPct.toFixed(2)}%)</span>}
              </div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Realized P&L</div>
              <div className={`kpi-val ${realizedPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 14 }}>
                {(realizedPnl >= 0 ? "+" : "") + fmtFiat(realizedPnl, base)}
              </div>
            </div>
          </div>

          {/* Open Lots */}
          {lots.length > 0 && (
            <>
              <h4 style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                Open Lots ({lots.length})
              </h4>
              <div className="tableWrap" style={{ marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Qty</th><th>Remaining</th><th>Unit Cost</th><th>Cost Basis</th></tr>
                  </thead>
                  <tbody>
                    {lots.map(l => (
                      <tr key={l.id}>
                        <td className="mono">{new Date(l.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</td>
                        <td className="mono">{fmtQty(l.qty)}</td>
                        <td className="mono">{fmtQty(l.qtyRem)}</td>
                        <td className="mono">${fmtPx(l.unitCost)}</td>
                        <td className="mono">{fmtFiat(l.qtyRem * l.unitCost, base)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Transaction History */}
          <h4 style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Transaction History ({txs.length})
          </h4>
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th><th>Value</th><th>Fee</th></tr>
              </thead>
              <tbody>
                {txs.length > 0 ? txs.map(t => (
                  <tr key={t.id}>
                    <td className="mono">{new Date(t.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</td>
                    <td className={`mono ${t.type === "buy" ? "good" : t.type === "sell" ? "bad" : ""}`} style={{ fontWeight: 900 }}>{t.type.toUpperCase()}</td>
                    <td className="mono">{fmtQty(t.qty)}</td>
                    <td className="mono">${fmtPx(t.price)}</td>
                    <td className="mono">{fmtFiat(t.qty * t.price, base)}</td>
                    <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee, base) : "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="muted">No transactions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
            {dca.entries} holdings entries · {lots.length} open lots · {txs.length} transactions
          </div>
        </div>
      </div>
    </div>
  );
}
