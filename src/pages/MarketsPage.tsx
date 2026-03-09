import { useState, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import MarketStats from "@/components/markets/MarketStats";
import MarketTable from "@/components/markets/MarketTable";
import BubbleCanvas from "@/components/markets/BubbleCanvas";

const TIME_RANGES = [
  { key: "1h", label: "1H" },
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
];

export default function MarketsPage() {
  const { state, setState, toast } = useCrypto();
  const { coins: allCoins, loading } = useLivePrices();
  const [view, setView] = useState<"table" | "bubbles">("table");
  const [timeRange, setTimeRange] = useState("24h");
  const [coinCount, setCoinCount] = useState(100);

  const coins = allCoins.slice(0, coinCount);

  const isWatched = useCallback((sym: string) =>
    state.watch.includes(sym.toUpperCase()), [state.watch]);

  const toggleWatch = useCallback((sym: string) => {
    const s = sym.toUpperCase();
    if (state.watch.includes(s)) {
      setState(prev => ({ ...prev, watch: prev.watch.filter(w => w !== s) }));
    } else {
      setState(prev => ({ ...prev, watch: [...prev.watch, s] }));
      toast("Added " + s + " to watchlist", "good");
    }
  }, [state.watch, setState, toast]);

  return (
    <>
      {/* Top stats banner */}
      <MarketStats coins={allCoins} />

      {/* Controls bar */}
      <div className="market-controls">
        <div className="seg">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
            <span style={{ fontSize: 12 }}>☰</span> Table
          </button>
          <button className={view === "bubbles" ? "active" : ""} onClick={() => setView("bubbles")}>
            <span style={{ fontSize: 12 }}>◉</span> Bubbles
          </button>
        </div>

        <div className="seg">
          {TIME_RANGES.map(t => (
            <button key={t.key} className={timeRange === t.key ? "active" : ""} onClick={() => setTimeRange(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="seg">
          {[100, 250, 500].map(n => (
            <button key={n} className={coinCount === n ? "active" : ""} onClick={() => setCoinCount(n)}>
              Top {n}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="panel">
          <div className="panel-body">
            <div className="market-loading">
              <div className="market-loading-spinner" />
              <span className="muted">Loading market data…</span>
            </div>
          </div>
        </div>
      )}

      {/* Table view */}
      {!loading && view === "table" && (
        <MarketTable
          coins={coins}
          isWatched={isWatched}
          toggleWatch={toggleWatch}
          timeRange={timeRange}
        />
      )}

      {/* Bubble view */}
      {!loading && view === "bubbles" && (
        <BubbleCanvas coins={coins} timeRange={timeRange} />
      )}
    </>
  );
}
