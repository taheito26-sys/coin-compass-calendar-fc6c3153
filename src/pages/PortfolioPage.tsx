import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { usePortfolio } from "@/hooks/usePortfolio";
import { mergePositionSources } from "@/lib/mergePositions";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import AssetDrilldown from "@/components/AssetDrilldown";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";

// Mini sparkline canvas component
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    ctx.beginPath();
    ctx.strokeStyle = positive ? "var(--good, #16a34a)" : "var(--bad, #dc2626)";
    ctx.lineWidth = 1.5;
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, positive]);
  return <canvas ref={ref} width={100} height={30} style={{ display: "block" }} />;
}

// Available column definitions
const ALL_COLUMNS = [
  { key: "rank", label: "#", default: true },
  { key: "asset", label: "Asset", default: true },
  { key: "amount", label: "Amount", default: true },
  { key: "sparkline", label: "Price Graph", default: true },
  { key: "change1h", label: "1h %", default: true },
  { key: "change24h", label: "24h %", default: true },
  { key: "change7d", label: "7d %", default: true },
  { key: "price", label: "Price", default: true },
  { key: "total", label: "Value", default: true },
  { key: "allocation", label: "Allocation %", default: true },
  { key: "avg", label: "Avg Buy", default: true },
  { key: "avgSell", label: "Avg Sell", default: false },
  { key: "pnl", label: "P/L", default: true },
  { key: "pnlPct", label: "Profit %", default: true },
  { key: "profitAbs", label: "Profit / Unrealized", default: false },
  { key: "marketCap", label: "Market Cap", default: false },
  { key: "volume", label: "Volume 24h", default: false },
];

const STORAGE_KEY = "portfolio_visible_cols";
const COL_ORDER_KEY = "portfolio_col_order";

function loadVisibleCols(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set(ALL_COLUMNS.filter(c => c.default).map(c => c.key));
}

function loadColOrder(): string[] {
  try {
    const raw = localStorage.getItem(COL_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return ALL_COLUMNS.map(c => c.key);
}

export default function PortfolioPage() {
  const portfolio = usePortfolio();
  const { state, refresh } = useCrypto();
  const { coins: liveCoinsList, loading: pricesLoading, getPrice } = useLivePrices();
  const localD = cryptoDerived(state);
  const [sortCol, setSortCol] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(loadVisibleCols);
  const [colOrder, setColOrder] = useState<string[]>(loadColOrder);
  const [showColConfig, setShowColConfig] = useState(false);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [drilldownSym, setDrilldownSym] = useState<string | null>(null);

  const workerReady = portfolio.authenticated && !portfolio.error && !portfolio.loading;
  const hasWorkerData = workerReady && portfolio.positions.length > 0;
  const base = state.base || "USD";

  // Merge local + worker positions
  const mergedRows = useMemo(() => {
    return mergePositionSources(localD.rows, portfolio.positions, hasWorkerData);
  }, [localD.rows, portfolio.positions, hasWorkerData]);

  // Persist visible columns and order
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleCols]));
  }, [visibleCols]);
  useEffect(() => {
    localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder));
  }, [colOrder]);

  const toggleCol = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Build unified position list with live prices from merged data
  const positions = useMemo(() => {
    return mergedRows.map(r => {
      const live = getPrice(r.sym);
      const livePrice = live?.current_price ?? r.price;
      const avg = r.qty > 0 ? r.cost / r.qty : 0;
      const total = livePrice !== null ? (livePrice ?? 0) * r.qty : 0;
      const pnlAbs = livePrice !== null ? total - r.cost : 0;
      const pnlPct = r.cost > 0 && livePrice !== null ? (pnlAbs / r.cost) * 100 : 0;
      const c1h = live?.price_change_percentage_1h_in_currency ?? 0;
      const c24h = live?.price_change_percentage_24h_in_currency ?? 0;
      const c7d = live?.price_change_percentage_7d_in_currency ?? 0;
      return {
        sym: r.sym, name: r.sym, qty: r.qty, price: livePrice, avg, total, cost: r.cost, pnlAbs, pnlPct,
        coinId: live?.id ?? r.sym.toLowerCase(),
        change1h: c1h, change24h: c24h, change7d: c7d,
        marketCap: live?.market_cap ?? 0,
        volume: live?.total_volume ?? 0,
        source: r.source,
      };
    });
  }, [mergedRows, liveCoinsList, getPrice]);

  // Fetch real 7-day sparkline data
  const sparkCoinIds = useMemo(() => positions.map(p => p.coinId), [positions]);
  const sparkData = useSparklineData(sparkCoinIds);

  const totalMV = positions.reduce((s, p) => s + p.total, 0);

  const sorted = useMemo(() => {
    const m = sortDir === "asc" ? 1 : -1;
    return [...positions].sort((a, b) => {
      switch (sortCol) {
        case "qty": return (a.qty - b.qty) * m;
        case "price": return ((a.price ?? 0) - (b.price ?? 0)) * m;
        case "total": return (a.total - b.total) * m;
        case "avg": return (a.avg - b.avg) * m;
        case "pnl": return (a.pnlAbs - b.pnlAbs) * m;
        case "allocation": return (a.total - b.total) * m;
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
    await Promise.all([portfolio.refresh(), refresh(true)]);
  };

  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const show = (key: string) => visibleCols.has(key);

  function formatCompact(n: number): string {
    if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(0) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
    return "$" + n.toLocaleString();
  }

  return (
    <>
      {!portfolio.loading && !portfolio.authenticated && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body muted" style={{ fontSize: 12 }}>
            ⚠ Not signed in — showing local data only.
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

      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn secondary" onClick={handleRefresh} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
        <button className="btn secondary" onClick={() => setShowColConfig(!showColConfig)} style={{ padding: "6px 10px", fontSize: 11 }}>
          ⚙ Columns
        </button>
        {hasWorkerData && <span className="pill" style={{ background: "var(--brand3)", color: "var(--brand)" }}>Worker ✓</span>}
        <span className="pill">Live prices · Top 500</span>
      </div>

      {/* Column configurator */}
      {showColConfig && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body" style={{ padding: 10 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>Drag to reorder · Click to toggle</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {colOrder.map(key => {
                const col = ALL_COLUMNS.find(c => c.key === key);
                if (!col) return null;
                return (
                  <label
                    key={col.key}
                    draggable
                    onDragStart={() => setDragCol(col.key)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (dragCol && dragCol !== col.key) {
                        setColOrder(prev => {
                          const next = [...prev];
                          const fromIdx = next.indexOf(dragCol);
                          const toIdx = next.indexOf(col.key);
                          next.splice(fromIdx, 1);
                          next.splice(toIdx, 0, dragCol);
                          return next;
                        });
                      }
                      setDragCol(null);
                    }}
                    onDragEnd={() => setDragCol(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                      padding: "4px 8px", borderRadius: 6, cursor: "grab",
                      background: visibleCols.has(col.key) ? "var(--brand3)" : "var(--panel2)",
                      border: `1px solid ${dragCol === col.key ? "var(--brand)" : visibleCols.has(col.key) ? "var(--brand)" : "var(--line)"}`,
                      color: visibleCols.has(col.key) ? "var(--brand)" : "var(--muted)",
                      fontWeight: visibleCols.has(col.key) ? 700 : 400,
                      opacity: dragCol === col.key ? 0.5 : 1,
                      userSelect: "none",
                    }}
                  >
                    <span style={{ cursor: "grab", marginRight: 2 }}>⠿</span>
                    <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} style={{ display: "none" }} />
                    {col.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Assets</h2>
          <span className="pill">{sorted.length} positions</span>
        </div>
        <div className="panel-body" style={{ padding: 0, overflow: "auto" }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {colOrder.filter(k => visibleCols.has(k)).map(key => {
                    const col = ALL_COLUMNS.find(c => c.key === key)!;
                    const sortable = ["price", "total", "allocation", "avg", "pnl", "qty"].includes(key);
                    return sortable
                      ? <SortTh key={key} col={key} label={col.label} />
                      : <th key={key}>{col.label}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.length > 0 ? sorted.map((pos, i) => {
                  const alloc = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
                  const handleRowClick = () => setDrilldownSym(pos.sym);
                  const cellMap: Record<string, React.ReactNode> = {
                    rank: <td key="rank" className="mono muted">{i + 1}</td>,
                    asset: (
                      <td key="asset">
                        <span className="mono" style={{ fontWeight: 900 }}>{pos.sym}</span>
                        {pos.name !== pos.sym && <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>· {pos.name}</span>}
                      </td>
                    ),
                    sparkline: <td key="sparkline"><Sparkline data={sparkData.get(pos.coinId) || []} positive={pos.change7d >= 0} /></td>,
                    amount: <td key="amount" className="mono">{fmtQty(pos.qty)}</td>,
                    change1h: <td key="change1h">{renderChangePill(pos.change1h)}</td>,
                    change24h: <td key="change24h">{renderChangePill(pos.change24h)}</td>,
                    change7d: <td key="change7d">{renderChangePill(pos.change7d)}</td>,
                    price: <td key="price" className="mono">{pos.price !== null ? "$" + fmtPx(pos.price) : "—"}</td>,
                    total: <td key="total" className="mono" style={{ fontWeight: 700 }}>{fmtFiat(pos.total, base)}</td>,
                    allocation: (
                      <td key="allocation">
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 40, height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(alloc, 100)}%`, height: "100%", borderRadius: 3, background: "var(--brand)" }} />
                          </div>
                          <span className="mono" style={{ fontSize: 11 }}>{alloc.toFixed(1)}%</span>
                        </div>
                      </td>
                    ),
                    avg: <td key="avg" className="mono">{pos.avg > 0 ? "$" + fmtPx(pos.avg) : "—"}</td>,
                    avgSell: <td key="avgSell" className="mono muted">—</td>,
                    pnl: (
                      <td key="pnl" style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900, fontFamily: "var(--lt-font-mono)", color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)" }}>
                          {(pos.pnlAbs >= 0 ? "+" : "") + "$" + Math.abs(pos.pnlAbs).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: pos.pnlPct >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 600 }}>
                          {pos.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
                        </div>
                      </td>
                    ),
                    pnlPct: (
                      <td key="pnlPct">
                        <span className={`mono ${pos.pnlPct >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
                          {pos.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
                        </span>
                      </td>
                    ),
                    profitAbs: (
                      <td key="profitAbs" className="mono" style={{ color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
                        {(pos.pnlAbs >= 0 ? "+" : "-") + "$" + Math.abs(pos.pnlAbs).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    ),
                    marketCap: <td key="marketCap" className="mono">{formatCompact(pos.marketCap)}</td>,
                    volume: <td key="volume" className="mono">{formatCompact(pos.volume)}</td>,
                  };
                  return (
                    <tr key={pos.sym} onClick={handleRowClick} style={{ cursor: "pointer" }}>
                      {colOrder.filter(k => visibleCols.has(k)).map(k => cellMap[k])}
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={20} className="muted">No assets. Import trades in the Ledger.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {drilldownSym && (
        <AssetDrilldown sym={drilldownSym} onClose={() => setDrilldownSym(null)} />
      )}
    </>
  );
}
