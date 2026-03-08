import { fmtFiat, fmtQty, fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import { useIsMobile } from "@/hooks/use-mobile";
import AssetDrilldown from "@/components/AssetDrilldown";
import { Sparkline } from "@/components/portfolio/Sparkline";
import { AssetFilter } from "@/components/portfolio/AssetFilter";
import { useState, useMemo, useEffect, Fragment } from "react";
import type { DerivedLot } from "@/lib/derivePortfolio";

/* ── View mode ── */
type ViewMode = "dca" | "lot";
const VIEW_MODE_KEY = "portfolio_view_mode";
function loadViewMode(): ViewMode {
  try { const v = localStorage.getItem(VIEW_MODE_KEY); if (v === "dca" || v === "lot") return v; } catch {}
  return "dca";
}

/* ── Column config ── */
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
  { key: "realizedPnl", label: "Realized P/L", default: false },
  { key: "marketCap", label: "Market Cap", default: false },
  { key: "volume", label: "Volume 24h", default: false },
];

const STORAGE_KEY = "portfolio_visible_cols";
const COL_ORDER_KEY = "portfolio_col_order";

function loadVisibleCols(): Set<string> {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return new Set(JSON.parse(raw)); } catch {}
  return new Set(ALL_COLUMNS.filter(c => c.default).map(c => c.key));
}
function loadColOrder(): string[] {
  try { const raw = localStorage.getItem(COL_ORDER_KEY); if (raw) return JSON.parse(raw); } catch {}
  return ALL_COLUMNS.map(c => c.key);
}

/* ── Display row type ── */
interface DisplayRow {
  sym: string; name: string; qty: number; price: number | null; avg: number;
  total: number; cost: number; pnlAbs: number; pnlPct: number; realizedPnl: number;
  coinId: string;
  change1h: number; change24h: number; change7d: number;
  marketCap: number; volume: number;
  lots: DerivedLot[];
}

function formatCompact(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(0) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(0) + "M";
  return n.toLocaleString();
}

function renderChangePill(val: number) {
  if (val === 0) return <span className="mono muted">—</span>;
  return (
    <span className={`mono ${val > 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
      {val > 0 ? "▲" : "▼"} {Math.abs(val).toFixed(2)}%
    </span>
  );
}

/* ── Main ── */
export default function PortfolioPage() {
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();
  const isMobile = useIsMobile();

  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [sortCol, setSortCol] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(loadVisibleCols);
  const [colOrder, setColOrder] = useState<string[]>(loadColOrder);
  const [showColConfig, setShowColConfig] = useState(false);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [drilldownSym, setDrilldownSym] = useState<string | null>(null);
  const [filterSyms, setFilterSyms] = useState<Set<string>>(new Set());
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());

  const base = portfolio.base;

  // Persist
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleCols])); }, [visibleCols]);
  useEffect(() => { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder)); }, [colOrder]);

  const toggleCol = (key: string) => {
    setVisibleCols(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };
  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const toggleExpand = (sym: string) => {
    setExpandedAssets(prev => { const next = new Set(prev); next.has(sym) ? next.delete(sym) : next.add(sym); return next; });
  };

  // Build display rows
  const displayRows = useMemo<DisplayRow[]>(() => {
    return portfolio.positions.map(r => {
      const live = getPrice(r.sym);
      const livePrice = live?.current_price ?? r.price;
      const total = livePrice !== null ? (livePrice ?? 0) * r.qty : 0;
      const pnlAbs = livePrice !== null ? total - r.cost : 0;
      const pnlPct = r.cost > 0 && livePrice !== null ? (pnlAbs / r.cost) * 100 : 0;
      return {
        sym: r.sym, name: r.sym, qty: r.qty, price: livePrice, avg: r.avg,
        total, cost: r.cost, pnlAbs, pnlPct, realizedPnl: r.realizedPnl,
        coinId: live?.id ?? r.sym.toLowerCase(),
        change1h: live?.price_change_percentage_1h_in_currency ?? 0,
        change24h: live?.price_change_percentage_24h_in_currency ?? 0,
        change7d: live?.price_change_percentage_7d_in_currency ?? 0,
        marketCap: live?.market_cap ?? 0,
        volume: live?.total_volume ?? 0,
        lots: r.lots,
      };
    });
  }, [portfolio.positions, getPrice]);

  const sparkCoinIds = useMemo(() => displayRows.map(p => p.coinId), [displayRows]);
  const sparkData = useSparklineData(sparkCoinIds);

  // Filter
  const filteredRows = useMemo(() => {
    if (filterSyms.size === 0) return displayRows;
    return displayRows.filter(r => filterSyms.has(r.sym));
  }, [displayRows, filterSyms]);

  const allSymbols = useMemo(() => displayRows.map(r => r.sym), [displayRows]);
  const totalMV = filteredRows.reduce((s, p) => s + p.total, 0);

  // Sort (applies to parent rows only)
  const sorted = useMemo(() => {
    const m = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
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
  }, [filteredRows, sortCol, sortDir]);

  const totalCost = filteredRows.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const visibleKeys = colOrder.filter(k => visibleCols.has(k));

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  /* ── Build cell map for a parent row ── */
  function buildCellMap(pos: DisplayRow, i: number, isLotView: boolean): Record<string, React.ReactNode> {
    const alloc = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
    const expandIcon = isLotView && pos.lots.length > 0
      ? (expandedAssets.has(pos.sym) ? "▾" : "▸")
      : null;

    return {
      rank: <td key="rank" className="mono muted">{i + 1}</td>,
      asset: (
        <td key="asset">
          {expandIcon && (
            <span style={{ marginRight: 6, fontSize: 10, cursor: "pointer", color: "var(--muted)" }}
              onClick={e => { e.stopPropagation(); toggleExpand(pos.sym); }}>
              {expandIcon}
            </span>
          )}
          <span className="mono" style={{ fontWeight: 900 }}>{pos.sym}</span>
          {isLotView && pos.lots.length > 0 && (
            <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>· {pos.lots.length} lots</span>
          )}
        </td>
      ),
      sparkline: <td key="sparkline"><Sparkline data={sparkData.get(pos.coinId) || []} positive={pos.change7d >= 0} /></td>,
      amount: <td key="amount" className="mono">{fmtQty(pos.qty)}</td>,
      change1h: <td key="change1h">{renderChangePill(pos.change1h)}</td>,
      change24h: <td key="change24h">{renderChangePill(pos.change24h)}</td>,
      change7d: <td key="change7d">{renderChangePill(pos.change7d)}</td>,
      price: <td key="price" className="mono">{pos.price !== null ? fmtPx(pos.price) : "—"}</td>,
      total: <td key="total" className="mono" style={{ fontWeight: 700 }}>{fmtTotal(pos.total)}</td>,
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
      avg: <td key="avg" className="mono">{pos.avg > 0 ? fmtPx(pos.avg) : "—"}</td>,
      avgSell: <td key="avgSell" className="mono muted">—</td>,
      pnl: (
        <td key="pnl" style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 900, fontFamily: "var(--lt-font-mono)", color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)" }}>
            {(pos.pnlAbs >= 0 ? "+" : "") + Math.abs(pos.pnlAbs).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
          {(pos.pnlAbs >= 0 ? "+" : "-") + Math.abs(pos.pnlAbs).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </td>
      ),
      realizedPnl: (
        <td key="realizedPnl" className="mono" style={{ color: pos.realizedPnl >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
          {(pos.realizedPnl >= 0 ? "+" : "") + fmtFiat(pos.realizedPnl, base)}
        </td>
      ),
      marketCap: <td key="marketCap" className="mono">{formatCompact(pos.marketCap)}</td>,
      volume: <td key="volume" className="mono">{formatCompact(pos.volume)}</td>,
    };
  }

  /* ── Build lot child row cells ── */
  function buildLotCells(lot: DerivedLot, parentPrice: number | null): Record<string, React.ReactNode> {
    const lotCost = lot.qtyRem * lot.unitCost;
    const lotMV = parentPrice !== null ? lot.qtyRem * parentPrice : null;
    const lotPnl = lotMV !== null ? lotMV - lotCost : null;
    const lotPnlPct = lotCost > 0 && lotPnl !== null ? (lotPnl / lotCost) * 100 : 0;
    const dateStr = new Date(lot.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

    return {
      rank: <td key="rank" />,
      asset: (
        <td key="asset" style={{ paddingLeft: 28 }}>
          <span className="muted" style={{ fontSize: 10 }}>{dateStr}</span>
          <span className="muted" style={{ fontSize: 9, marginLeft: 6, textTransform: "uppercase" }}>{lot.tag}</span>
        </td>
      ),
      sparkline: <td key="sparkline" />,
      amount: <td key="amount" className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{fmtQty(lot.qtyRem)}</td>,
      change1h: <td key="change1h" />,
      change24h: <td key="change24h" />,
      change7d: <td key="change7d" />,
      price: <td key="price" className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{fmtPx(lot.unitCost)}</td>,
      total: <td key="total" className="mono" style={{ fontSize: 11 }}>{fmtTotal(lotCost)}</td>,
      allocation: <td key="allocation" />,
      avg: <td key="avg" className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{fmtPx(lot.unitCost)}</td>,
      avgSell: <td key="avgSell" />,
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
      profitAbs: (
        <td key="profitAbs" className="mono" style={{ fontSize: 11, color: lotPnl !== null ? (lotPnl >= 0 ? "var(--good)" : "var(--bad)") : "var(--muted)" }}>
          {lotPnl !== null ? (lotPnl >= 0 ? "+" : "-") + Math.abs(lotPnl).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"}
        </td>
      ),
      realizedPnl: <td key="realizedPnl" />,
      marketCap: <td key="marketCap" />,
      volume: <td key="volume" />,
    };
  }

  /* ── Mobile lot card ── */
  function MobileLotCard({ lot, parentPrice }: { lot: DerivedLot; parentPrice: number | null }) {
    const lotCost = lot.qtyRem * lot.unitCost;
    const lotMV = parentPrice !== null ? lot.qtyRem * parentPrice : null;
    const lotPnl = lotMV !== null ? lotMV - lotCost : null;
    const dateStr = new Date(lot.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
    return (
      <div style={{
        marginLeft: 12, padding: "8px 10px", fontSize: 11,
        borderLeft: "2px solid var(--line)", background: "var(--panel2)", borderRadius: "0 6px 6px 0",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 4,
      }}>
        <div><span className="muted">Date</span> <span className="mono">{dateStr}</span></div>
        <div><span className="muted">Qty</span> <span className="mono">{fmtQty(lot.qtyRem)}</span></div>
        <div><span className="muted">Unit Cost</span> <span className="mono">{fmtPx(lot.unitCost)}</span></div>
        <div><span className="muted">Cost</span> <span className="mono">{fmtTotal(lotCost)}</span></div>
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
  }

  /* ── Mobile asset card ── */
  function MobileAssetCard({ pos, i }: { pos: DisplayRow; i: number }) {
    const alloc = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
    const isExpanded = expandedAssets.has(pos.sym);
    const isLot = viewMode === "lot";

    return (
      <div key={pos.sym} style={{
        background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
        padding: 12, marginBottom: 8,
      }}>
        {/* Header */}
        <div
          onClick={() => isLot ? toggleExpand(pos.sym) : setDrilldownSym(pos.sym)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 8 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isLot && pos.lots.length > 0 && (
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{isExpanded ? "▾" : "▸"}</span>
            )}
            <span className="mono" style={{ fontWeight: 900, fontSize: 14 }}>{pos.sym}</span>
            {isLot && <span className="muted" style={{ fontSize: 10 }}>{pos.lots.length} lots</span>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontWeight: 700 }}>{fmtTotal(pos.total)}</div>
            <div style={{ fontSize: 10, color: pos.pnlPct >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 600 }}>
              {pos.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
            </div>
          </div>
        </div>
        {/* Details grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
          <div><span className="muted">Qty </span><span className="mono">{fmtQty(pos.qty)}</span></div>
          <div><span className="muted">Price </span><span className="mono">{pos.price !== null ? fmtPx(pos.price) : "—"}</span></div>
          <div><span className="muted">Avg </span><span className="mono">{pos.avg > 0 ? fmtPx(pos.avg) : "—"}</span></div>
          <div><span className="muted">Cost </span><span className="mono">{fmtFiat(pos.cost, base)}</span></div>
          <div><span className="muted">Alloc </span><span className="mono">{alloc.toFixed(1)}%</span></div>
          <div>
            <span className="muted">P/L </span>
            <span className="mono" style={{ fontWeight: 700, color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)" }}>
              {(pos.pnlAbs >= 0 ? "+" : "") + fmtFiat(pos.pnlAbs, base)}
            </span>
          </div>
        </div>
        {/* Expanded lots (mobile) */}
        {isLot && isExpanded && pos.lots.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
              Open Lots
            </div>
            {pos.lots
              .slice().sort((a, b) => a.ts - b.ts)
              .map(lot => <MobileLotCard key={lot.id} lot={lot} parentPrice={pos.price} />)}
          </div>
        )}
        {/* Tap for drilldown on non-lot view */}
        {!isLot && (
          <div
            onClick={() => setDrilldownSym(pos.sym)}
            style={{ marginTop: 6, fontSize: 10, color: "var(--brand)", cursor: "pointer", textAlign: "center" }}
          >
            Tap for details →
          </div>
        )}
      </div>
    );
  }

  /* ──────── RENDER ──────── */
  return (
    <>
      {/* Summary KPIs */}
      <div className="kpis" style={{ marginBottom: 10 }}>
        <div className="kpi-card">
          <div className="kpi-lbl">PORTFOLIO VALUE</div>
          <div className="kpi-val">{fmtFiat(totalMV, base)}</div>
          <div className="kpi-sub">{filteredRows.length} assets</div>
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

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* View mode toggle */}
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }}>
          {(["dca", "lot"] as ViewMode[]).map(mode => (
            <button
              key={mode}
              className={`btn ${viewMode === mode ? "" : "secondary"}`}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "6px 12px", fontSize: 11, borderRadius: 0, fontWeight: viewMode === mode ? 800 : 400,
                background: viewMode === mode ? "var(--brand)" : "transparent",
                color: viewMode === mode ? "var(--brand-fg, #fff)" : "var(--fg)",
                border: "none",
              }}
            >
              {mode === "dca" ? "DCA View" : "Lot View"}
            </button>
          ))}
        </div>

        <AssetFilter allSymbols={allSymbols} selected={filterSyms} onChange={setFilterSyms} />

        <button className="btn secondary" onClick={() => setShowColConfig(!showColConfig)} style={{ padding: "6px 10px", fontSize: 11 }}>
          ⚙ Columns
        </button>
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

      {/* Table Panel */}
      <div className="panel">
        <div className="panel-head">
          <h2>Assets</h2>
          <span className="pill">
            {sorted.length} positions{viewMode === "lot" && ` · ${sorted.reduce((s, r) => s + r.lots.length, 0)} lots`}
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0, overflow: "auto" }}>
          {isMobile ? (
            /* ── MOBILE: Card layout ── */
            <div style={{ padding: 8 }}>
              {sorted.length > 0 ? sorted.map((pos, i) => (
                <MobileAssetCard key={pos.sym} pos={pos} i={i} />
              )) : (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>No assets. Import trades in the Ledger.</div>
              )}
            </div>
          ) : (
            /* ── DESKTOP: Table layout ── */
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    {visibleKeys.map(key => {
                      const col = ALL_COLUMNS.find(c => c.key === key)!;
                      const sortable = ["price", "total", "allocation", "avg", "pnl", "qty", "realizedPnl"].includes(key);
                      return sortable
                        ? <SortTh key={key} col={key} label={col.label} />
                        : <th key={key}>{col.label}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length > 0 ? sorted.map((pos, i) => {
                    const cellMap = buildCellMap(pos, i, viewMode === "lot");
                    const isExpanded = expandedAssets.has(pos.sym);
                    const lotRows = viewMode === "lot" && isExpanded
                      ? pos.lots.slice().sort((a, b) => a.ts - b.ts)
                      : [];

                    return (
                      <Fragment key={pos.sym}>
                        <tr
                          onClick={() => viewMode === "lot" ? toggleExpand(pos.sym) : setDrilldownSym(pos.sym)}
                          style={{
                            cursor: "pointer",
                            fontWeight: viewMode === "lot" ? 700 : undefined,
                            borderBottom: viewMode === "lot" && isExpanded ? "none" : undefined,
                          }}
                        >
                          {visibleKeys.map(k => cellMap[k])}
                        </tr>
                        {lotRows.map(lot => {
                          const lotCells = buildLotCells(lot, pos.price);
                          return (
                            <tr
                              key={lot.id}
                              onClick={() => setDrilldownSym(pos.sym)}
                              style={{
                                cursor: "pointer",
                                background: "var(--panel2)",
                                fontSize: 12,
                                borderBottom: "1px solid var(--line)",
                              }}
                            >
                              {visibleKeys.map(k => lotCells[k])}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  }) : (
                    <tr><td colSpan={20} className="muted">No assets. Import trades in the Ledger.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {drilldownSym && (
        <AssetDrilldown sym={drilldownSym} onClose={() => setDrilldownSym(null)} />
      )}
    </>
  );
}
