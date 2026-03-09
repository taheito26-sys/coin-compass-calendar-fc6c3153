import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import { useIsMobile } from "@/hooks/use-mobile";
import AssetDrilldown from "@/components/AssetDrilldown";
import { Sparkline } from "@/components/portfolio/Sparkline";
import { AssetFilter } from "@/components/portfolio/AssetFilter";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useState, useMemo, useEffect } from "react";
import type { DerivedLot } from "@/lib/derivePortfolio";

// ── View mode ──────────────────────────────────────────────────────────────

type ViewMode = "dca" | "lot";
const VIEW_MODE_KEY = "portfolio_view_mode";

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === "dca" || v === "lot") return v;
  } catch {}
  return "dca";
}

// ── Column config ──────────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { key: "rank",       label: "#",            default: true  },
  { key: "asset",      label: "Asset",        default: true  },
  { key: "amount",     label: "Amount",       default: true  },
  { key: "sparkline",  label: "Price Graph",  default: true  },
  { key: "change1h",   label: "1h %",         default: true  },
  { key: "change24h",  label: "24h %",        default: true  },
  { key: "change7d",   label: "7d %",         default: true  },
  { key: "price",      label: "Price",        default: true  },
  { key: "total",      label: "Value",        default: true  },
  { key: "allocation", label: "Allocation %", default: true  },
  { key: "avg",        label: "Avg Buy",      default: true  },
  { key: "avgSell",    label: "Avg Sell",     default: false },
  { key: "pnl",        label: "P/L",          default: true  },
  { key: "pnlPct",     label: "Profit %",     default: true  },
  { key: "realizedPnl",label: "Realized P/L", default: false },
  { key: "marketCap",  label: "Market Cap",   default: false },
  { key: "volume",     label: "Volume 24h",   default: false },
];

const STORAGE_KEY  = "portfolio_visible_cols";
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

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(0)  + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(0)  + "M";
  return n.toLocaleString();
}

function ChangePill({ val }: { val: number }) {
  if (val === 0) return <span className="mono muted">—</span>;
  return (
    <span className={`mono ${val > 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
      {val > 0 ? "▲" : "▼"} {Math.abs(val).toFixed(2)}%
    </span>
  );
}

// ── Display row type ───────────────────────────────────────────────────────

interface DisplayRow {
  sym: string;
  name: string;
  qty: number;
  price: number | null;
  avg: number;
  total: number;
  cost: number;
  pnlAbs: number;
  pnlPct: number;
  realizedPnl: number;
  coinId: string;
  change1h: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  volume: number;
  lots: DerivedLot[];
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { state } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();
  const isMobile = useIsMobile();

  const base = state.base || "USD";

  // Local UI state
  const [viewMode,       setViewMode]       = useState<ViewMode>(loadViewMode);
  const [visibleCols,    setVisibleCols]    = useState<Set<string>>(loadVisibleCols);
  const [colOrder,       setColOrder]       = useState<string[]>(loadColOrder);
  const [sortCol,        setSortCol]        = useState("total");
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("desc");
  const [filterSyms,     setFilterSyms]     = useState<Set<string>>(new Set());
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
  const [showColConfig,  setShowColConfig]  = useState(false);
  const [dragCol,        setDragCol]        = useState<string | null>(null);
  const [drilldownSym,   setDrilldownSym]   = useState<string | null>(null);

  // Persist UI prefs
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); },  [viewMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY,   JSON.stringify([...visibleCols])); }, [visibleCols]);
  useEffect(() => { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder)); },        [colOrder]);

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

  const toggleExpand = (sym: string) => {
    setExpandedAssets(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const handleRefresh = () => window.location.reload();

  const isLotView = viewMode === "lot";

  // Build display rows from unified portfolio
  const displayRows = useMemo<DisplayRow[]>(() => {
    return portfolio.positions.map(r => {
      const live      = getPrice(r.sym);
      const livePrice = live?.current_price ?? r.price ?? null;
      const total     = livePrice !== null ? (livePrice ?? 0) * r.qty : r.qty * (r.price ?? 0);
      const cost      = r.cost;
      const pnlAbs    = livePrice !== null ? total - cost : 0;
      const pnlPct    = cost > 0 && livePrice !== null ? (pnlAbs / cost) * 100 : 0;

      return {
        sym:         r.sym,
        name:        r.sym,
        qty:         r.qty,
        price:       livePrice,
        avg:         r.avg,
        total,
        cost,
        pnlAbs,
        pnlPct,
        realizedPnl: r.realizedPnl,
        coinId:      live?.id ?? r.sym.toLowerCase(),
        change1h:    live?.price_change_percentage_1h_in_currency  ?? 0,
        change24h:   live?.price_change_percentage_24h_in_currency ?? 0,
        change7d:    live?.price_change_percentage_7d_in_currency  ?? 0,
        marketCap:   live?.market_cap    ?? 0,
        volume:      live?.total_volume  ?? 0,
        lots:        r.lots,
      };
    });
  }, [portfolio.positions, getPrice]);

  const sparkCoinIds = useMemo(() => displayRows.map(p => p.coinId), [displayRows]);
  const sparkData    = useSparklineData(sparkCoinIds);
  const allSymbols   = useMemo(() => displayRows.map(r => r.sym), [displayRows]);

  // Filter
  const filteredRows = useMemo(() => {
    if (filterSyms.size === 0) return displayRows;
    return displayRows.filter(r => filterSyms.has(r.sym));
  }, [displayRows, filterSyms]);

  const totalMV   = filteredRows.reduce((s, p) => s + p.total, 0);
  const totalCost = filteredRows.reduce((s, p) => s + p.cost,  0);
  const totalPnl  = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // Sort
  const sorted = useMemo(() => {
    const m = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      switch (sortCol) {
        case "qty":        return (a.qty         - b.qty)         * m;
        case "price":      return ((a.price ?? 0) - (b.price ?? 0)) * m;
        case "avg":        return (a.avg         - b.avg)         * m;
        case "pnl":        return (a.pnlAbs      - b.pnlAbs)      * m;
        case "allocation": return (a.total       - b.total)       * m;
        default:           return (a.total       - b.total)       * m;
      }
    });
  }, [filteredRows, sortCol, sortDir]);

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  // ── Mobile card ──────────────────────────────────────────────────────────

  function MobileCard({ pos }: { pos: DisplayRow }) {
    const alloc    = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
    const isLot    = isLotView;
    const isExpanded = expandedAssets.has(pos.sym);

    return (
      <div style={{
        background: "var(--panel2)", border: "1px solid var(--line)",
        borderRadius: "var(--lt-radius)", padding: 12, cursor: "pointer",
      }} onClick={() => !isLot && setDrilldownSym(pos.sym)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <span className="mono" style={{ fontWeight: 900, fontSize: 15 }}>{pos.sym}</span>
            <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>{alloc.toFixed(1)}%</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{fmtFiat(pos.total, base)}</div>
            <div style={{ fontSize: 11, color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 600 }}>
              {pos.pnlAbs >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
          <div><span className="muted">Qty </span><span className="mono">{fmtQty(pos.qty)}</span></div>
          <div><span className="muted">Price </span><span className="mono">{pos.price !== null ? "$" + fmtPx(pos.price) : "—"}</span></div>
          <div><span className="muted">Avg </span><span className="mono">{pos.avg > 0 ? "$" + fmtPx(pos.avg) : "—"}</span></div>
          <div><span className="muted">Cost </span><span className="mono">{fmtFiat(pos.cost, base)}</span></div>
          <div>
            <span className="muted">P/L </span>
            <span className="mono" style={{ fontWeight: 700, color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)" }}>
              {(pos.pnlAbs >= 0 ? "+" : "") + fmtFiat(pos.pnlAbs, base)}
            </span>
          </div>
        </div>
        {isLot && isExpanded && pos.lots.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Open Lots</div>
            {pos.lots.slice().sort((a, b) => a.ts - b.ts).map(lot => {
              const lotCost = lot.qtyRem * lot.unitCost;
              const lotMV   = pos.price !== null ? lot.qtyRem * pos.price : null;
              const lotPnl  = lotMV !== null ? lotMV - lotCost : null;
              const dateStr = new Date(lot.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
              return (
                <div key={lot.id} style={{
                  marginLeft: 12, padding: "8px 10px", fontSize: 11,
                  borderLeft: "2px solid var(--line)", background: "var(--panel2)",
                  borderRadius: "0 6px 6px 0", display: "grid",
                  gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 4,
                }}>
                  <div><span className="muted">Date </span><span className="mono">{dateStr}</span></div>
                  <div><span className="muted">Qty </span><span className="mono">{fmtQty(lot.qtyRem)}</span></div>
                  <div><span className="muted">Unit Cost </span><span className="mono">{fmtPx(lot.unitCost)}</span></div>
                  {lotPnl !== null && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span className="muted">P/L </span>
                      <span className="mono" style={{ fontWeight: 700, color: lotPnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                        {(lotPnl >= 0 ? "+" : "") + fmtFiat(lotPnl, base)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!isLot && (
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--brand)", textAlign: "center" }}>Tap for details →</div>
        )}
      </div>
    );
  }

  // ── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "80vh", padding: "0 2px" }}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2" style={{ background: "var(--panel2)", border: "1px solid var(--line)" }}>
          <TabsTrigger value="portfolio" style={{ fontSize: 11 }}>Portfolio</TabsTrigger>
          <TabsTrigger value="alerts" style={{ fontSize: 11 }}>Alerts</TabsTrigger>
          
        </TabsList>

        <TabsContent value="portfolio" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Compact KPIs — 40% smaller */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px", minWidth: 100 }}>
              <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Portfolio Value</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 900 }}>{fmtTotal(totalMV)}</div>
              <div style={{ fontSize: 8, color: "var(--muted)" }}>{filteredRows.length} assets</div>
            </div>
            <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px", minWidth: 100 }}>
              <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total P&L</div>
              <div className={`mono ${totalPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 14, fontWeight: 900 }}>
                {(totalPnl >= 0 ? "+" : "") + fmtTotal(totalPnl)}
              </div>
              <div style={{ fontSize: 8, color: "var(--muted)" }}>{totalPnlPct.toFixed(2)}%</div>
            </div>
            <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px", minWidth: 100 }}>
              <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total Cost</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 900 }}>{fmtTotal(totalCost)}</div>
            </div>
          </div>

          {/* Single-line toolbar: filter + buttons + pill */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
            <AssetFilter allSymbols={allSymbols} selected={filterSyms} onChange={setFilterSyms} />
            <button className="btn secondary" onClick={handleRefresh} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
            <button className="btn secondary" onClick={() => setShowColConfig(v => !v)} style={{ padding: "6px 10px", fontSize: 11 }}>⚙ Columns</button>
            <button
              className="btn secondary"
              onClick={() => setViewMode(v => v === "dca" ? "lot" : "dca")}
              style={{ padding: "6px 10px", fontSize: 11 }}
            >
              {isLotView ? "📊 DCA View" : "📦 Lot View"}
            </button>
            <span className="pill" style={{ marginLeft: "auto" }}>Live prices · Top 500</span>
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
                              const toIdx   = next.indexOf(col.key);
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

          {/* Mobile cards */}
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {sorted.length === 0 ? (
                <div className="muted" style={{ textAlign: "center", padding: 32 }}>No assets. Import trades in the Ledger.</div>
              ) : sorted.map(pos => <MobileCard key={pos.sym} pos={pos} />)}
            </div>
          ) : (
            /* Desktop table */
            <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="panel-head">
                <h2>Assets</h2>
                <span className="pill">
                  {sorted.length} positions{isLotView && ` · ${sorted.reduce((s, r) => s + r.lots.length, 0)} lots`}
                </span>
              </div>
              <div className="panel-body" style={{ padding: 0, overflow: "auto", flex: 1 }}>
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
                      {sorted.length === 0 ? (
                        <tr>
                          <td colSpan={20} className="muted" style={{ textAlign: "center", padding: 32 }}>
                            No assets. Import trades in the Ledger.
                          </td>
                        </tr>
                      ) : sorted.map((pos, i) => {
                        const alloc     = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
                        const isExpanded = expandedAssets.has(pos.sym);

                        const cellMap: Record<string, React.ReactNode> = {
                          rank: <td key="rank" className="mono muted">{i + 1}</td>,
                          asset: (
                            <td key="asset" style={{ cursor: "pointer" }} onClick={() => setDrilldownSym(pos.sym)}>
                              {isLotView && pos.lots.length > 0 && (
                                <span
                                  style={{ marginRight: 6, fontSize: 10, cursor: "pointer", color: "var(--muted)" }}
                                  onClick={e => { e.stopPropagation(); toggleExpand(pos.sym); }}
                                >
                                  {isExpanded ? "▾" : "▸"}
                                </span>
                              )}
                              <span className="mono" style={{ fontWeight: 900 }}>{pos.sym}</span>
                            </td>
                          ),
                          sparkline: <td key="sparkline"><Sparkline data={sparkData.get(pos.coinId) ?? []} positive={pos.change7d >= 0} /></td>,
                          amount:    <td key="amount"    className="mono">{fmtQty(pos.qty)}</td>,
                          change1h:  <td key="change1h"><ChangePill val={pos.change1h} /></td>,
                          change24h: <td key="change24h"><ChangePill val={pos.change24h} /></td>,
                          change7d:  <td key="change7d"><ChangePill val={pos.change7d} /></td>,
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
                          avg:      <td key="avg"      className="mono">{pos.avg > 0 ? "$" + fmtPx(pos.avg) : "—"}</td>,
                          avgSell:  <td key="avgSell"  className="mono muted">—</td>,
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
                          realizedPnl: (
                            <td key="realizedPnl" className="mono" style={{ color: pos.realizedPnl >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
                              {(pos.realizedPnl >= 0 ? "+" : "") + fmtFiat(pos.realizedPnl, base)}
                            </td>
                          ),
                          marketCap: <td key="marketCap" className="mono">{formatCompact(pos.marketCap)}</td>,
                          volume:    <td key="volume"    className="mono">{formatCompact(pos.volume)}</td>,
                        };

                        const rows: React.ReactNode[] = [
                          <tr key={pos.sym} style={{ cursor: "pointer" }} onClick={() => !isLotView && setDrilldownSym(pos.sym)}>
                            {colOrder.filter(k => visibleCols.has(k)).map(k => cellMap[k])}
                          </tr>,
                        ];

                        // Expanded lot rows
                        if (isLotView && isExpanded && pos.lots.length > 0) {
                          pos.lots.slice().sort((a, b) => a.ts - b.ts).forEach(lot => {
                            const lotCost   = lot.qtyRem * lot.unitCost;
                            const lotMV     = pos.price !== null ? lot.qtyRem * pos.price : null;
                            const lotPnl    = lotMV !== null ? lotMV - lotCost : null;
                            const lotPnlPct = lotCost > 0 && lotPnl !== null ? (lotPnl / lotCost) * 100 : 0;
                            const dateStr   = new Date(lot.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

                            const lotCells: Record<string, React.ReactNode> = {
                              rank: <td key="rank" />,
                              asset: (
                                <td key="asset" style={{ paddingLeft: 28 }}>
                                  <span className="muted" style={{ fontSize: 10 }}>{dateStr}</span>
                                  <span className="muted" style={{ fontSize: 9, marginLeft: 6, textTransform: "uppercase" }}>{lot.tag}</span>
                                </td>
                              ),
                              sparkline:   <td key="sparkline" />,
                              amount:      <td key="amount"    className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{fmtQty(lot.qtyRem)}</td>,
                              change1h:    <td key="change1h" />,
                              change24h:   <td key="change24h" />,
                              change7d:    <td key="change7d" />,
                              price:       <td key="price"    className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{fmtPx(lot.unitCost)}</td>,
                              total:       <td key="total"    className="mono" style={{ fontSize: 11 }}>{fmtFiat(lotCost, base)}</td>,
                              allocation:  <td key="allocation" />,
                              avg:         <td key="avg"      className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{fmtPx(lot.unitCost)}</td>,
                              avgSell:     <td key="avgSell" />,
                              pnl: (
                                <td key="pnl" style={{ textAlign: "right" }}>
                                  {lotPnl !== null ? (
                                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: lotPnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                                      {(lotPnl >= 0 ? "+" : "") + fmtFiat(lotPnl, base)}
                                    </span>
                                  ) : <span className="mono muted" style={{ fontSize: 11 }}>—</span>}
                                </td>
                              ),
                              pnlPct: (
                                <td key="pnlPct">
                                  {lotPnl !== null ? (
                                    <span className={`mono ${lotPnlPct >= 0 ? "good" : "bad"}`} style={{ fontWeight: 600, fontSize: 10 }}>
                                      {lotPnlPct >= 0 ? "▲" : "▼"} {Math.abs(lotPnlPct).toFixed(2)}%
                                    </span>
                                  ) : <span className="mono muted" style={{ fontSize: 10 }}>—</span>}
                                </td>
                              ),
                              realizedPnl: <td key="realizedPnl" />,
                              marketCap:   <td key="marketCap" />,
                              volume:      <td key="volume" />,
                            };

                            rows.push(
                              <tr key={`${pos.sym}-lot-${lot.id}`} style={{ background: "var(--panel2)" }}>
                                {colOrder.filter(k => visibleCols.has(k)).map(k => lotCells[k])}
                              </tr>
                            );
                          });
                        }

                        return rows;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts">
          <Suspense fallback={<div className="muted" style={{ padding: 20, textAlign: "center" }}>Loading…</div>}>
            <AlertsPage />
          </Suspense>
        </TabsContent>

      </Tabs>

      {drilldownSym && (
        <AssetDrilldown sym={drilldownSym} onClose={() => setDrilldownSym(null)} />
      )}
    </div>
  );
}
