import { useMemo } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
  timeRange: string;
}

function getChange(coin: LiveCoin, timeRange: string) {
  switch (timeRange) {
    case "1h": return coin.price_change_percentage_1h_in_currency || 0;
    case "7d": return coin.price_change_percentage_7d_in_currency || 0;
    default: return coin.price_change_percentage_24h_in_currency || 0;
  }
}

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(0) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toFixed(0);
}

function formatPrice(p: number): string {
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

function getHeatColor(change: number): string {
  const clamped = Math.max(-15, Math.min(15, change));
  const t = (clamped + 15) / 30; // 0 = deep red, 1 = deep green
  if (t < 0.4) {
    const intensity = (0.4 - t) / 0.4;
    return `rgba(220,38,38,${0.08 + intensity * 0.35})`;
  }
  if (t > 0.6) {
    const intensity = (t - 0.6) / 0.4;
    return `rgba(34,197,94,${0.08 + intensity * 0.35})`;
  }
  return "rgba(255,255,255,0.03)";
}

function getTextColor(change: number): string {
  if (change > 0.5) return "var(--good, #22c55e)";
  if (change < -0.5) return "var(--bad, #ef4444)";
  return "var(--muted)";
}

// Size tiers based on market cap rank for treemap-like feel
function getTileSpan(rank: number): number {
  if (rank <= 2) return 3;
  if (rank <= 5) return 2;
  return 1;
}

export default function HeatmapGrid({ coins, timeRange }: Props) {
  const tiles = useMemo(() => {
    return coins.slice(0, 100).map(coin => ({
      ...coin,
      change: getChange(coin, timeRange),
      span: getTileSpan(coin.market_cap_rank),
    }));
  }, [coins, timeRange]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Market Heatmap</h2>
        <div style={{ flex: 1 }} />
        <span className="pill">{tiles.length} coins</span>
      </div>
      <div className="panel-body" style={{ padding: 8 }}>
        <div className="heatmap-grid">
          {tiles.map(coin => (
            <div
              key={coin.id}
              className="heatmap-tile"
              style={{
                background: getHeatColor(coin.change),
                gridColumn: coin.span > 1 ? `span ${coin.span}` : undefined,
                gridRow: coin.span > 2 ? "span 2" : coin.span > 1 ? "span 2" : undefined,
              }}
            >
              <div className="heatmap-tile-header">
                {coin.image && (
                  <img src={coin.image} alt="" className="heatmap-tile-icon" loading="lazy" />
                )}
                <span className="heatmap-tile-symbol">{coin.symbol.toUpperCase()}</span>
              </div>
              <div
                className="heatmap-tile-change"
                style={{ color: getTextColor(coin.change) }}
              >
                {coin.change >= 0 ? "+" : ""}{coin.change.toFixed(2)}%
              </div>
              {coin.span > 1 && (
                <>
                  <div className="heatmap-tile-price">{formatPrice(coin.current_price)}</div>
                  <div className="heatmap-tile-mcap">{formatCompact(coin.market_cap)}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
