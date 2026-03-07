import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { useSupabasePortfolio } from "@/hooks/useSupabasePortfolio";
import { useState, useMemo, useEffect, useRef } from "react";

interface CoinGeckoPrice {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}

export default function PortfolioPage() {
  const sb = useSupabasePortfolio();
  const { state, refresh } = useCrypto();
  const localD = cryptoDerived(state);
  const [sortCol, setSortCol] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [livePrices, setLivePrices] = useState<Map<string, CoinGeckoPrice>>(new Map());
  const intervalRef = useRef<number>(0);

  const useSupabase = sb.authenticated && !sb.error;
  const base = state.base || "USD";

  // Fetch live prices from CoinGecko every 30s
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const pages = [1, 2, 3, 4, 5];
        const results = await Promise.all(
          pages.map(page =>
            fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`, { signal: AbortSignal.timeout(15000) })
              .then(r => r.ok ? r.json() : [])
              .catch(() => [])
          )
        );
        const all: CoinGeckoPrice[] = results.flat();
        const map = new Map<string, CoinGeckoPrice>();
        for (const c of all) map.set(c.symbol.toUpperCase(), c);
        setLivePrices(map);
      } catch {}
    };
    fetchPrices();
    intervalRef.current = window.setInterval(fetchPrices, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Build unified position list with live prices
  const positions = useMemo(() => {
    const buildPos = (sym: string, name: string, qty: number, cost: number) => {
      const live = livePrices.get(sym.toUpperCase());
      const livePrice = live?.current_price ?? null;
      const price = livePrice;
      const avg = qty > 0 ? cost / qty : 0;
      const total = price !== null ? price * qty : 0;
      const pnlAbs = price !== null ? total - cost : 0;
      const pnlPct = cost > 0 && price !== null ? (pnlAbs / cost) * 100 : 0;
      return {
        sym,
        name,
        qty,
        price,
        avg,
        total,
        cost,
        pnlAbs,
        pnlPct,
        change1h: live?.price_change_percentage_1h_in_currency ?? 0,
        change24h: live?.price_change_percentage_24h_in_currency ?? 0,
        change7d: live?.price_change_percentage_7d_in_currency ?? 0,
      };
    };

    if (useSupabase && sb.positions.length > 0) {
      return sb.positions.map(p => buildPos(p.symbol, p.name, p.qty, p.cost));
    }
    return localD.rows.map(r => buildPos(r.sym, r.sym, r.qty, r.cost));
  }, [useSupabase, sb.positions, localD.rows, livePrices]);

  const sorted = useMemo(() => {
    const m = sortDir === "asc" ? 1 : -1;
    return [...positions].sort((a, b) => {
      switch (sortCol) {
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

  // Totals
  const totalMV = positions.reduce((s, p) => s + p.total, 0);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <>
      {!sb.loading && !sb.authenticated && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body muted" style={{ fontSize: 12 }}>
            ⚠ Not logged in — showing local data only. Sign in to see Supabase positions.
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="kpis" style={{ marginBottom: 10 }}>
        <div className="kpi-card">
          <div className="kpi-lbl">PORTFOLIO VALUE</div>
          <div className="kpi-val">{fmtFiat(totalMV, base)}</div>
          <div className="kpi-sub">{positions.length} assets</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">TOTAL P&L</div>
          <div className={`kpi-val ${totalPnl >= 0 ? "good" : "bad"}`}>
            {(totalPnl >= 0 ? "+" : "") + fmtFiat(totalPnl, base)}
          </div>
          <div className="kpi-sub">{totalPnlPct.toFixed(2)}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">TOTAL COST</div>
          <div className="kpi-val">{fmtFiat(totalCost, base)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <button className="btn secondary" onClick={handleRefresh} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
        {useSupabase && <span className="pill" style={{ background: "var(--brand3)", color: "var(--brand)" }}>Supabase ✓</span>}
        <span className="pill">Live prices · Top 500</span>
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
                  <th>#</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>1h</th>
                  <th>24h</th>
                  <th>7d</th>
                  <SortTh col="price" label="Price" />
                  <SortTh col="total" label="Value" />
                  <SortTh col="avg" label="Avg Buy" />
                  <SortTh col="pnl" label="P/L" />
                </tr>
              </thead>
              <tbody>
                {sorted.length > 0 ? sorted.map((pos, i) => (
                  <tr key={pos.sym}>
                    <td className="mono muted">{i + 1}</td>
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
                        {(pos.pnlAbs >= 0 ? "+" : "") + "$" + Math.abs(pos.pnlAbs).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
    </>
  );
}
