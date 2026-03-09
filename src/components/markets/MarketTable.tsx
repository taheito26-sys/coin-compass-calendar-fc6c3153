import { useState, useMemo } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import { Sparkline } from "@/components/portfolio/Sparkline";

interface Props {
  coins: LiveCoin[];
  isWatched: (sym: string) => boolean;
  toggleWatch: (sym: string) => void;
  timeRange: string;
  watchOnly?: boolean;
}

type SortKey = string;
type SortDir = "asc" | "desc";

// All available columns
interface ColumnDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  align?: "left" | "right" | "center";
  width?: number;
  render: (coin: LiveCoin, extra: { sparklines: Map<string, number[]>; isWatched: boolean }) => React.ReactNode;
  sortValue?: (coin: LiveCoin) => number | string;
}

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

function formatPrice(p: number): string {
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return "$" + p.toFixed(2);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + p.toFixed(6);
}

function ChangePill({ val }: { val: number | null }) {
  if (val == null) return <span className="mono muted" style={{ fontSize: 11 }}>—</span>;
  const cls = val > 0 ? "market-change-up" : val < 0 ? "market-change-down" : "market-change-flat";
  return (
    <span className={`market-change ${cls}`}>
      {val > 0 ? "▲" : val < 0 ? "▼" : ""} {Math.abs(val).toFixed(2)}%
    </span>
  );
}

const COLUMN_STORAGE_KEY = "market_visible_columns";

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: "rank", label: "#", group: "Basic", defaultVisible: true, align: "left", width: 40,
    render: (c) => <span className="mono muted" style={{ fontSize: 11 }}>{c.market_cap_rank}</span>,
    sortValue: (c) => c.market_cap_rank,
  },
  {
    key: "coin", label: "Coin", group: "Basic", defaultVisible: true, align: "left",
    render: (c) => (
      <div className="market-coin-cell">
        {c.image ? (
          <img src={c.image} alt="" className="market-coin-icon" loading="lazy" />
        ) : (
          <div className="market-coin-icon-placeholder">{c.symbol.slice(0, 2).toUpperCase()}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="market-coin-symbol-primary">{c.symbol.toUpperCase()}</span>
          <span className="market-coin-name-sub">{c.name}</span>
        </div>
      </div>
    ),
    sortValue: (c) => c.symbol,
  },
  {
    key: "price", label: "Price", group: "Price", defaultVisible: true, align: "right",
    render: (c) => <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(c.current_price)}</span>,
    sortValue: (c) => c.current_price,
  },
  {
    key: "1h", label: "1h %", group: "Change", defaultVisible: true, align: "right",
    render: (c) => <ChangePill val={c.price_change_percentage_1h_in_currency} />,
    sortValue: (c) => c.price_change_percentage_1h_in_currency || 0,
  },
  {
    key: "24h", label: "24h %", group: "Change", defaultVisible: true, align: "right",
    render: (c) => <ChangePill val={c.price_change_percentage_24h_in_currency} />,
    sortValue: (c) => c.price_change_percentage_24h_in_currency || 0,
  },
  {
    key: "7d", label: "7d %", group: "Change", defaultVisible: true, align: "right",
    render: (c) => <ChangePill val={c.price_change_percentage_7d_in_currency} />,
    sortValue: (c) => c.price_change_percentage_7d_in_currency || 0,
  },
  {
    key: "mcap", label: "Market Cap", group: "Market", defaultVisible: true, align: "right",
    render: (c) => <span className="mono" style={{ fontSize: 12 }}>{formatCompact(c.market_cap)}</span>,
    sortValue: (c) => c.market_cap || 0,
  },
  {
    key: "vol", label: "Volume 24h", group: "Market", defaultVisible: true, align: "right",
    render: (c) => <span className="mono" style={{ fontSize: 12 }}>{formatCompact(c.total_volume)}</span>,
    sortValue: (c) => c.total_volume || 0,
  },
  {
    key: "sparkline", label: "7d Chart", group: "Chart", defaultVisible: true, align: "center", width: 100,
    render: (c, { sparklines }) => {
      const data = sparklines.get(c.id) || [];
      const up = (c.price_change_percentage_7d_in_currency || 0) >= 0;
      return data.length > 1 ? <Sparkline data={data} positive={up} /> : <span className="muted" style={{ fontSize: 10 }}>—</span>;
    },
  },
  {
    key: "high24h", label: "24h High", group: "Price", defaultVisible: false, align: "right",
    render: (c) => <span className="mono" style={{ fontSize: 12 }}>{formatPrice((c as any).high_24h || c.current_price)}</span>,
    sortValue: (c) => (c as any).high_24h || c.current_price,
  },
  {
    key: "low24h", label: "24h Low", group: "Price", defaultVisible: false, align: "right",
    render: (c) => <span className="mono" style={{ fontSize: 12 }}>{formatPrice((c as any).low_24h || c.current_price)}</span>,
    sortValue: (c) => (c as any).low_24h || c.current_price,
  },
  {
    key: "ath", label: "ATH", group: "Price", defaultVisible: false, align: "right",
    render: (c) => <span className="mono" style={{ fontSize: 12 }}>{(c as any).ath ? formatPrice((c as any).ath) : "—"}</span>,
    sortValue: (c) => (c as any).ath || 0,
  },
  {
    key: "athChange", label: "ATH %", group: "Change", defaultVisible: false, align: "right",
    render: (c) => <ChangePill val={(c as any).ath_change_percentage ?? null} />,
    sortValue: (c) => (c as any).ath_change_percentage || 0,
  },
  {
    key: "circSupply", label: "Circ. Supply", group: "Market", defaultVisible: false, align: "right",
    render: (c) => {
      const supply = (c as any).circulating_supply;
      if (!supply) return <span className="muted" style={{ fontSize: 10 }}>—</span>;
      return <span className="mono" style={{ fontSize: 12 }}>{supply >= 1e9 ? (supply / 1e9).toFixed(1) + "B" : supply >= 1e6 ? (supply / 1e6).toFixed(0) + "M" : supply.toLocaleString()}</span>;
    },
    sortValue: (c) => (c as any).circulating_supply || 0,
  },
  {
    key: "totalSupply", label: "Total Supply", group: "Market", defaultVisible: false, align: "right",
    render: (c) => {
      const supply = (c as any).total_supply;
      if (!supply) return <span className="muted" style={{ fontSize: 10 }}>—</span>;
      return <span className="mono" style={{ fontSize: 12 }}>{supply >= 1e9 ? (supply / 1e9).toFixed(1) + "B" : supply >= 1e6 ? (supply / 1e6).toFixed(0) + "M" : supply.toLocaleString()}</span>;
    },
    sortValue: (c) => (c as any).total_supply || 0,
  },
  {
    key: "mcapRank", label: "MCap Rank", group: "Market", defaultVisible: false, align: "right",
    render: (c) => <span className="mono muted" style={{ fontSize: 11 }}>#{c.market_cap_rank}</span>,
    sortValue: (c) => c.market_cap_rank,
  },
  {
    key: "volMcapRatio", label: "Vol/MCap", group: "Market", defaultVisible: false, align: "right",
    render: (c) => {
      const ratio = c.market_cap ? (c.total_volume / c.market_cap) : 0;
      return <span className="mono" style={{ fontSize: 11 }}>{(ratio * 100).toFixed(2)}%</span>;
    },
    sortValue: (c) => c.market_cap ? (c.total_volume / c.market_cap) : 0,
  },
];

function getDefaultVisibleCols(): string[] {
  try {
    const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
}

export default function MarketTable({ coins, isWatched, toggleWatch, timeRange, watchOnly }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [visibleCols, setVisibleCols] = useState<string[]>(getDefaultVisibleCols);
  const [showColPicker, setShowColPicker] = useState(false);
  const [colOrder, setColOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("market_col_order");
      if (saved) return JSON.parse(saved);
    } catch {}
    return ALL_COLUMNS.map(c => c.key);
  });
  const [dragCol, setDragCol] = useState<string | null>(null);

  const sparklineIds = useMemo(() =>
    coins.slice(0, 50).map(c => c.id).filter(Boolean),
    [coins]
  );
  const sparklines = useSparklineData(sparklineIds);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "rank" ? "asc" : "desc"); }
  };

  const toggleCol = (key: string) => {
    setVisibleCols(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const saveColOrder = (order: string[]) => {
    setColOrder(order);
    localStorage.setItem("market_col_order", JSON.stringify(order));
  };

  const columns = useMemo(() => {
    return colOrder
      .filter(k => visibleCols.includes(k))
      .map(k => ALL_COLUMNS.find(c => c.key === k)!)
      .filter(Boolean);
  }, [visibleCols, colOrder]);

  const baseCoins = useMemo(() => {
    if (watchOnly) return coins.filter(c => isWatched(c.symbol));
    return coins;
  }, [coins, watchOnly, isWatched]);

  const filtered = useMemo(() => {
    if (!search) return baseCoins;
    const q = search.toLowerCase();
    return baseCoins.filter(c =>
      c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [baseCoins, search]);

  const sorted = useMemo(() => {
    const col = ALL_COLUMNS.find(c => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  return (
    <>
      {/* Toolbar — matches Assets page */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn secondary" onClick={() => setShowColPicker(p => !p)} style={{ padding: "6px 10px", fontSize: 11 }}>⚙ Columns</button>
        <input
          className="market-search-input"
          type="text"
          placeholder="Search coin…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="pill">{filtered.length} coins</span>
      </div>

      {/* Column configurator — same draggable pill design as Assets page */}
      {showColPicker && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body" style={{ padding: 10 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>Drag to reorder · Click to toggle</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {colOrder.map(key => {
                const col = ALL_COLUMNS.find(c => c.key === key);
                if (!col) return null;
                const active = visibleCols.includes(col.key);
                return (
                  <span
                    key={col.key}
                    draggable
                    onDragStart={() => setDragCol(col.key)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (dragCol && dragCol !== col.key) {
                        const next = [...colOrder];
                        const fromIdx = next.indexOf(dragCol);
                        const toIdx = next.indexOf(col.key);
                        next.splice(fromIdx, 1);
                        next.splice(toIdx, 0, dragCol);
                        saveColOrder(next);
                      }
                      setDragCol(null);
                    }}
                    onDragEnd={() => setDragCol(null)}
                    onClick={() => toggleCol(col.key)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11,
                      padding: "4px 8px", borderRadius: 6, cursor: "grab",
                      background: active ? "var(--brand3)" : "var(--panel2)",
                      border: `1px solid ${dragCol === col.key ? "var(--brand)" : active ? "var(--brand)" : "var(--line)"}`,
                      color: active ? "var(--brand)" : "var(--muted)",
                      fontWeight: active ? 700 : 400,
                      opacity: dragCol === col.key ? 0.5 : 1,
                      userSelect: "none",
                    }}
                  >
                    <span style={{ cursor: "grab", marginRight: 2 }}>⠿</span>
                    {col.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head" style={{ gap: 8 }}>
          <h2>{watchOnly ? "Watchlist" : "Cryptocurrency Prices"}</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {watchOnly && filtered.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>☆</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>No coins in your watchlist</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Star coins in the Table view to add them here</div>
            </div>
          ) : (
            <div className="tableWrap" style={{ maxHeight: "calc(100dvh - 280px)", overflow: "auto" }}>
              <table className="market-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    {columns.map(col => (
                      <th
                        key={col.key}
                        onClick={() => col.sortValue && toggleSort(col.key)}
                        style={{
                          cursor: col.sortValue ? "pointer" : "default",
                          userSelect: "none",
                          textAlign: col.align || "left",
                          width: col.width,
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {col.label}
                          {sortKey === col.key && (
                            <span style={{ fontSize: 9, opacity: 0.7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(coin => (
                    <tr key={coin.id} className="market-row">
                      <td>
                        <span
                          className={`market-star ${isWatched(coin.symbol) ? "active" : ""}`}
                          onClick={() => toggleWatch(coin.symbol)}
                        >
                          {isWatched(coin.symbol) ? "★" : "☆"}
                        </span>
                      </td>
                      {columns.map(col => (
                        <td key={col.key} style={{ textAlign: col.align || "left" }}>
                          {col.render(coin, { sparklines, isWatched: isWatched(coin.symbol) })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
