import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { useSupabasePortfolio } from "@/hooks/useSupabasePortfolio";
import { useState, useMemo } from "react";

export default function PortfolioPage() {
  const sb = useSupabasePortfolio();
  const { state, refresh } = useCrypto();
  const localD = cryptoDerived(state);
  const [sortCol, setSortCol] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pnlMode, setPnlMode] = useState<"unrealized" | "realized">("unrealized");

  const useSupabase = sb.authenticated && !sb.error;
  const base = state.base || "USD";

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Build unified position list
  const positions = useMemo(() => {
    if (useSupabase && sb.positions.length > 0) {
      return sb.positions.map((p, i) => ({
        rank: i + 1,
        sym: p.symbol,
        name: p.name,
        qty: p.qty,
        price: p.price,
        avg: p.avg,
        total: p.mv || 0,
        cost: p.cost,
        pnlAbs: p.pnlAbs ?? 0,
        pnlPct: p.pnlPct ?? 0,
        change1h: p.priceChange1h ?? 0,
        change24h: p.priceChange24h ?? 0,
        change7d: p.priceChange7d ?? 0,
      }));
    }
    // Local fallback
    return localD.rows.map((r, i) => ({
      rank: i + 1,
      sym: r.sym,
      name: r.sym,
      qty: r.qty,
      price: r.price,
      avg: r.qty > 0 ? r.cost / r.qty : 0,
      total: r.mv || 0,
      cost: r.cost,
      pnlAbs: r.unreal ?? 0,
      pnlPct: r.cost > 0 ? ((r.unreal ?? 0) / r.cost) * 100 : 0,
      change1h: 0,
      change24h: 0,
      change7d: 0,
    }));
  }, [useSupabase, sb.positions, localD.rows]);

  const sorted = useMemo(() => {
    const m = sortDir === "asc" ? 1 : -1;
    return [...positions].sort((a, b) => {
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
  }, [positions, sortCol, sortDir]);

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  const renderChangePill = (val: number) => {
    if (val === 0) return <span className="mono muted">—</span>;
    return (
      <span className={`mono ${val > 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
        {val > 0 ? "▲" : "▼"} {Math.abs(val).toFixed(2)}%
      </span>
    );
  };

  const handleRefresh = async () => {
    await Promise.all([sb.refresh(), refresh(true)]);
  };

  return (
    <>
      {!sb.loading && !sb.authenticated && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body muted" style={{ fontSize: 12 }}>
            ⚠ Not logged in — showing local data only. Sign in to see Supabase positions.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn secondary" onClick={handleRefresh} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
        {useSupabase && <span className="pill" style={{ background: "var(--brand3)", color: "var(--brand)" }}>Supabase ✓</span>}
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
                      {pos.name !== pos.sym && <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>· {pos.name}</span>}
                    </td>
                    <td className="mono">{fmtQty(pos.qty)}</td>
                    <td>{renderChangePill(pos.change1h)}</td>
                    <td>{renderChangePill(pos.change24h)}</td>
                    <td>{renderChangePill(pos.change7d)}</td>
                    <td className="mono">{pos.price !== null ? "$" + fmtPx(pos.price) : "—"}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{fmtFiat(pos.total, base)}</td>
                    <td className="mono">{pos.avg > 0 ? "$" + fmtPx(pos.avg) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{
                        fontWeight: 900,
                        fontFamily: "var(--lt-font-mono)",
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

      {/* Lots - local only */}
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
                  <td className="mono">{fmtPx(l.unitCost)} {base}</td>
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
