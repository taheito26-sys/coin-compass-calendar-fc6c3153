import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
}

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toLocaleString();
}

export default function MarketStats({ coins }: Props) {
  if (!coins.length) return null;

  const totalMcap = coins.reduce((s, c) => s + (c.market_cap || 0), 0);
  const totalVol = coins.reduce((s, c) => s + (c.total_volume || 0), 0);
  const btc = coins.find(c => c.symbol === "btc");
  const eth = coins.find(c => c.symbol === "eth");
  const btcDom = btc && totalMcap > 0 ? ((btc.market_cap / totalMcap) * 100).toFixed(1) : "—";
  const ethDom = eth && totalMcap > 0 ? ((eth.market_cap / totalMcap) * 100).toFixed(1) : "—";

  const gainers = coins.filter(c => (c.price_change_percentage_24h_in_currency || 0) > 0).length;
  const losers = coins.filter(c => (c.price_change_percentage_24h_in_currency || 0) < 0).length;

  return (
    <div className="market-stats-bar">
      <div className="market-stat">
        <span className="market-stat-label">Market Cap</span>
        <span className="market-stat-value">{formatCompact(totalMcap)}</span>
      </div>
      <div className="market-stat">
        <span className="market-stat-label">24h Volume</span>
        <span className="market-stat-value">{formatCompact(totalVol)}</span>
      </div>
      <div className="market-stat">
        <span className="market-stat-label">BTC Dominance</span>
        <span className="market-stat-value">{btcDom}%</span>
      </div>
      <div className="market-stat">
        <span className="market-stat-label">ETH Dominance</span>
        <span className="market-stat-value">{ethDom}%</span>
      </div>
      <div className="market-stat">
        <span className="market-stat-label">Gainers / Losers</span>
        <span className="market-stat-value">
          <span className="good">{gainers}</span>
          <span className="muted" style={{ margin: "0 3px" }}>/</span>
          <span className="bad">{losers}</span>
        </span>
      </div>
    </div>
  );
}
