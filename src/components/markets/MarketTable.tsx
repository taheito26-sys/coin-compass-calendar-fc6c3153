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

  const columns = useMemo(() => ALL_COLUMNS.filter(c => visibleCols.includes(c.key)), [visibleCols]);

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

  // Group columns for picker
  const groups = useMemo(() => {
    const g: Record<string, ColumnDef[]> = {};
    ALL_COLUMNS.forEach(c => { (g[c.group] ??= []).push(c); });
    return g;
  }, []);

  return (
    <div className="panel">
      <div className="panel-head" style={{ gap: 8 }}>
        <h2>{watchOnly ? "Watchlist" : "Cryptocurrency Prices"}</h2>
        <div style={{ flex: 1 }} />
        <input
          className="market-search-input"
          type="text"
          placeholder="Search coin…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {/* Column picker toggle */}
        <div style={{ position: "relative" }}>
          <button
            className="btn secondary"
            onClick={() => setShowColPicker(p => !p)}
            style={{ fontSize: 10, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
          >
            ⚙ Columns
          </button>
          {showColPicker && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setShowColPicker(false)} />
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 4,
                background: "var(--panel)", border: "1px solid var(--line)",
                borderRadius: "var(--lt-radius-sm)", padding: 12,
                zIndex: 99, minWidth: 220, maxHeight: 360, overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,.3)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Show/Hide Columns</div>
                {Object.entries(groups).map(([group, cols]) => (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{group}</div>
                    {cols.map(col => (
                      <label key={col.key} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 11, color: "var(--text)", cursor: "pointer",
                        padding: "3px 0",
                      }}>
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(col.key)}
                          onChange={() => toggleCol(col.key)}
                          style={{ accentColor: "var(--brand)" }}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                ))}
                <button
                  onClick={() => {
                    const defaults = ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
                    setVisibleCols(defaults);
                    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(defaults));
                  }}
                  style={{
                    marginTop: 4, fontSize: 9, padding: "3px 8px", borderRadius: 4,
                    background: "none", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer",
                  }}
                >
                  Reset to defaults
                </button>
              </div>
            </>
          )}
        </div>
        <span className="pill">{filtered.length} coins</span>
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
  );
}
