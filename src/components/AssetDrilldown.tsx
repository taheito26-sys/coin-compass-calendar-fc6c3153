import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useMemo } from "react";

interface Props {
  sym: string;
  onClose: () => void;
}

export default function AssetDrilldown({ sym, onClose }: Props) {
  const { state } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const base = portfolio.base;

  // Get position from unified portfolio (same data as Dashboard and Assets page)
  const position = portfolio.getPosition(sym);

  const qty = position?.qty ?? 0;
  const avgCost = position?.avg ?? 0;
  const currentPrice = position?.price ?? null;
  const totalCost = position?.cost ?? 0;
  const mv = position?.mv ?? null;
  const unrealizedPnl = position?.unreal ?? null;
  const unrealizedPct = totalCost > 0 && unrealizedPnl !== null ? (unrealizedPnl / totalCost) * 100 : null;
  const realizedPnl = position?.realizedPnl ?? 0;
  const lots = position?.lots ?? [];

  // Transactions for this asset (from the single source of truth)
  const txs = useMemo(() => {
    return state.txs
      .filter(t => t.asset.toUpperCase() === sym.toUpperCase())
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50);
  }, [state.txs, sym]);

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
              <div className="kpi-val" style={{ fontSize: 16 }}>{fmtQty(qty)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Avg Cost</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>${fmtPx(avgCost)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Current Price</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{currentPrice !== null ? "$" + fmtPx(currentPrice) : "—"}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Market Value</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{mv !== null ? fmtFiat(mv, base) : "—"}</div>
            </div>
          </div>

          {/* P&L Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div className="cal-stat">
              <div className="kpi-lbl">Cost Basis</div>
              <div className="kpi-val" style={{ fontSize: 14 }}>{fmtFiat(totalCost, base)}</div>
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
            {lots.length} open lots · {txs.length} transactions
          </div>
        </div>
      </div>
    </div>
  );
}
