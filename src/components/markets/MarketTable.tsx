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

type SortKey = "rank" | "name" | "price" | "1h" | "24h" | "7d" | "mcap" | "vol";
type SortDir = "asc" | "desc";

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

export default function MarketTable({ coins, isWatched, toggleWatch, timeRange, watchOnly }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");

  const sparklineIds = useMemo(() =>
    coins.slice(0, 50).map(c => c.id).filter(Boolean),
    [coins]
  );
  const sparklines = useSparklineData(sparklineIds);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "rank" ? "asc" : "desc"); }
  };

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
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "rank": return (a.market_cap_rank - b.market_cap_rank) * dir;
        case "name": return a.symbol.localeCompare(b.symbol) * dir;
        case "price": return (a.current_price - b.current_price) * dir;
        case "1h": return ((a.price_change_percentage_1h_in_currency || 0) - (b.price_change_percentage_1h_in_currency || 0)) * dir;
        case "24h": return ((a.price_change_percentage_24h_in_currency || 0) - (b.price_change_percentage_24h_in_currency || 0)) * dir;
        case "7d": return ((a.price_change_percentage_7d_in_currency || 0) - (b.price_change_percentage_7d_in_currency || 0)) * dir;
        case "mcap": return ((a.market_cap || 0) - (b.market_cap || 0)) * dir;
        case "vol": return ((a.total_volume || 0) - (b.total_volume || 0)) * dir;
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const SortHeader = ({ label, col, align }: { label: string; col: SortKey; align?: string }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{ cursor: "pointer", userSelect: "none", textAlign: align as any || "left" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        {sortKey === col && (
          <span style={{ fontSize: 9, opacity: 0.7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );

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
                  <SortHeader label="#" col="rank" />
                  <SortHeader label="Coin" col="name" />
                  <SortHeader label="Price" col="price" align="right" />
                  <SortHeader label="1h" col="1h" align="right" />
                  <SortHeader label="24h" col="24h" align="right" />
                  <SortHeader label="7d" col="7d" align="right" />
                  <SortHeader label="Mkt Cap" col="mcap" align="right" />
                  <SortHeader label="Vol 24h" col="vol" align="right" />
                  <th style={{ width: 100, textAlign: "center" }}>7d Chart</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(coin => {
                  const sparkData = sparklines.get(coin.id) || [];
                  const is7dUp = (coin.price_change_percentage_7d_in_currency || 0) >= 0;
                  return (
                    <tr key={coin.id} className="market-row">
                      <td>
                        <span
                          className={`market-star ${isWatched(coin.symbol) ? "active" : ""}`}
                          onClick={() => toggleWatch(coin.symbol)}
                        >
                          {isWatched(coin.symbol) ? "★" : "☆"}
                        </span>
                      </td>
                      <td className="mono muted" style={{ fontSize: 11 }}>{coin.market_cap_rank}</td>
                      <td>
                        <div className="market-coin-cell">
                          {coin.image ? (
                            <img src={coin.image} alt="" className="market-coin-icon" loading="lazy" />
                          ) : (
                            <div className="market-coin-icon-placeholder">
                              {coin.symbol.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span className="market-coin-symbol-primary">{coin.symbol.toUpperCase()}</span>
                            <span className="market-coin-name-sub">{coin.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="mono" style={{ fontWeight: 700, textAlign: "right" }}>{formatPrice(coin.current_price)}</td>
                      <td style={{ textAlign: "right" }}><ChangePill val={coin.price_change_percentage_1h_in_currency} /></td>
                      <td style={{ textAlign: "right" }}><ChangePill val={coin.price_change_percentage_24h_in_currency} /></td>
                      <td style={{ textAlign: "right" }}><ChangePill val={coin.price_change_percentage_7d_in_currency} /></td>
                      <td className="mono" style={{ fontSize: 12, textAlign: "right" }}>{formatCompact(coin.market_cap)}</td>
                      <td className="mono" style={{ fontSize: 12, textAlign: "right" }}>{formatCompact(coin.total_volume)}</td>
                      <td style={{ textAlign: "center" }}>
                        {sparkData.length > 1 ? (
                          <Sparkline data={sparkData} positive={is7dUp} />
                        ) : (
                          <span className="muted" style={{ fontSize: 10 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
