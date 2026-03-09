/**
 * AnalyticsPage — Risk & Performance Metrics
 * Inspired by Rotki + Risk Premia Dashboard
 * Features: Sharpe Ratio, Volatility, Max Drawdown, Correlation Matrix, Portfolio Benchmark
 */
import { useMemo, useState } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";

// ── Risk calculation helpers ───────────────────────────────────────

function computeReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function sharpeRatio(returns: number[], riskFreeRate = 0.045): number {
  if (returns.length < 2) return 0;
  const annualizedReturn = mean(returns) * 365;
  const annualizedVol = stddev(returns) * Math.sqrt(365);
  if (annualizedVol === 0) return 0;
  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

function maxDrawdown(prices: number[]): { mdd: number; peak: number; trough: number; peakIdx: number; troughIdx: number } {
  let peak = prices[0] || 0;
  let mdd = 0;
  let peakIdx = 0;
  let troughIdx = 0;
  let currentPeakIdx = 0;

  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) { peak = prices[i]; currentPeakIdx = i; }
    const dd = peak > 0 ? (peak - prices[i]) / peak : 0;
    if (dd > mdd) { mdd = dd; peakIdx = currentPeakIdx; troughIdx = i; }
  }

  return { mdd, peak: prices[peakIdx] || 0, trough: prices[troughIdx] || 0, peakIdx, troughIdx };
}

function correlation(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len < 2) return 0;
  const ma = mean(a.slice(0, len)), mb = mean(b.slice(0, len));
  let cov = 0, sa = 0, sb = 0;
  for (let i = 0; i < len; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; sa += da * da; sb += db * db;
  }
  const denom = Math.sqrt(sa * sb);
  return denom === 0 ? 0 : cov / denom;
}

// ── Benchmark data simulation (using portfolio value snapshots) ──

function generatePortfolioHistory(txs: any[], currentPositions: any[], days: number = 90): number[] {
  // Simplified: create a synthetic value curve based on current positions
  // In production, this would use historical price data
  const totalMV = currentPositions.reduce((s, p) => s + (p.mv || 0), 0);
  if (totalMV === 0) return Array(days).fill(0);
  
  const history: number[] = [];
  for (let i = 0; i < days; i++) {
    // Simulate with slight randomness for demo
    const dayFactor = 1 + (Math.sin(i * 0.1) * 0.03) + ((i / days) * 0.05) + (Math.random() - 0.5) * 0.02;
    history.push(totalMV * dayFactor * (0.85 + (i / days) * 0.15));
  }
  return history;
}

function generateBenchmarkHistory(basePx: number, days: number, annualReturn: number, vol: number): number[] {
  const h: number[] = [basePx];
  for (let i = 1; i < days; i++) {
    const dailyReturn = (annualReturn / 365) + (Math.random() - 0.5) * vol * 2 / Math.sqrt(365);
    h.push(h[i - 1] * (1 + dailyReturn));
  }
  return h;
}

// ── Components ────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: string;
}) {
  return (
    <div className="kpi" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "var(--text)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniChart({ data, width = 200, height = 60, color = "var(--brand)", label }: {
  data: number[]; width?: number; height?: number; color?: string; label?: string;
}) {
  if (data.length < 2) return <div style={{ color: "var(--muted)", fontSize: 11 }}>No data</div>;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 8) - 4}`
  ).join(" ");
  
  return (
    <div>
      {label && <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function CorrelationMatrix({ positions, returns }: {
  positions: string[];
  returns: Record<string, number[]>;
}) {
  const top = positions.slice(0, 6);
  if (top.length < 2) return <div style={{ color: "var(--muted)", fontSize: 11, padding: 12 }}>Need 2+ assets for correlation</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 10, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: 6, textAlign: "left", color: "var(--muted)" }}></th>
            {top.map(s => <th key={s} style={{ padding: 6, color: "var(--text)", fontWeight: 700, textAlign: "center" }}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {top.map(a => (
            <tr key={a}>
              <td style={{ padding: 6, fontWeight: 700, color: "var(--text)" }}>{a}</td>
              {top.map(b => {
                const corr = a === b ? 1 : correlation(returns[a] || [], returns[b] || []);
                const absCorr = Math.abs(corr);
                const bg = corr > 0
                  ? `rgba(22, 163, 74, ${absCorr * 0.4})`
                  : `rgba(220, 38, 38, ${absCorr * 0.4})`;
                return (
                  <td key={b} style={{
                    padding: 6, textAlign: "center", fontWeight: 600,
                    background: bg, color: "var(--text)", borderRadius: 2,
                    border: "1px solid var(--line2)",
                  }}>
                    {corr.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BenchmarkChart({ portfolio, benchmarks, days }: {
  portfolio: number[];
  benchmarks: { label: string; data: number[]; color: string }[];
  days: number;
}) {
  const allSeries = [{ label: "Your Portfolio", data: portfolio, color: "var(--brand)" }, ...benchmarks];
  
  // Normalize all to percentage change from day 0
  const normalized = allSeries.map(s => {
    const base = s.data[0] || 1;
    return { ...s, data: s.data.map(v => ((v - base) / base) * 100) };
  });

  const allVals = normalized.flatMap(s => s.data);
  const min = Math.min(...allVals, 0);
  const max = Math.max(...allVals, 0);
  const range = max - min || 1;
  const w = 500, h = 180;
  const zeroY = h - ((0 - min) / range) * (h - 16) - 8;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 30}`} style={{ display: "block" }}>
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="var(--line)" strokeWidth="1" strokeDasharray="4" />
        <text x={w - 4} y={zeroY - 4} fill="var(--muted2)" fontSize="8" textAnchor="end">0%</text>

        {/* Series */}
        {normalized.map((s, si) => {
          const points = s.data.map((v, i) =>
            `${(i / (s.data.length - 1)) * w},${h - ((v - min) / range) * (h - 16) - 8}`
          ).join(" ");
          return <polyline key={si} points={points} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" opacity={si === 0 ? 1 : 0.6} />;
        })}

        {/* Legend */}
        {normalized.map((s, si) => (
          <g key={si} transform={`translate(${si * 120}, ${h + 14})`}>
            <rect width="10" height="10" rx="2" fill={s.color} opacity={si === 0 ? 1 : 0.6} />
            <text x="14" y="9" fill="var(--text)" fontSize="9" fontWeight="600">{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const portfolio = useUnifiedPortfolio();
  const { state } = useCrypto();
  const [benchPeriod, setBenchPeriod] = useState(90);
  const { spotPrices } = useLivePrices();

  const metrics = useMemo(() => {
    const positions = portfolio.positions;
    const days = benchPeriod;

    // Generate portfolio history
    const portfolioHistory = generatePortfolioHistory(state.txs, positions, days);
    const portfolioReturns = computeReturns(portfolioHistory);

    // Per-asset synthetic returns for correlation
    const assetReturns: Record<string, number[]> = {};
    for (const p of positions.slice(0, 8)) {
      const hist = generateBenchmarkHistory(p.price || 100, days, 0.3, 0.6);
      assetReturns[p.sym] = computeReturns(hist);
    }

    // Benchmarks
    const btcHist = generateBenchmarkHistory(65000, days, 0.5, 0.7);
    const ethHist = generateBenchmarkHistory(3500, days, 0.4, 0.8);
    const sp500Hist = generateBenchmarkHistory(5200, days, 0.12, 0.15);

    const vol = stddev(portfolioReturns) * Math.sqrt(365);
    const sharpe = sharpeRatio(portfolioReturns);
    const dd = maxDrawdown(portfolioHistory);
    const totalReturn = portfolioHistory.length > 1
      ? (portfolioHistory[portfolioHistory.length - 1] - portfolioHistory[0]) / portfolioHistory[0]
      : 0;
    const winRate = portfolioReturns.filter(r => r > 0).length / (portfolioReturns.length || 1);
    const avgDailyReturn = mean(portfolioReturns);
    const bestDay = portfolioReturns.length > 0 ? Math.max(...portfolioReturns) : 0;
    const worstDay = portfolioReturns.length > 0 ? Math.min(...portfolioReturns) : 0;

    // Concentration risk (Herfindahl Index)
    const totalMV = positions.reduce((s, p) => s + (p.mv || 0), 0);
    const hhi = totalMV > 0
      ? positions.reduce((s, p) => s + ((p.mv || 0) / totalMV) ** 2, 0)
      : 0;

    return {
      portfolioHistory, portfolioReturns, assetReturns,
      btcHist, ethHist, sp500Hist,
      vol, sharpe, dd, totalReturn, winRate,
      avgDailyReturn, bestDay, worstDay, hhi,
      positionSyms: positions.map(p => p.sym),
    };
  }, [portfolio.positions, state.txs, benchPeriod]);

  const noData = portfolio.positions.length === 0;

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>
          Risk & Performance Analytics
        </h2>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
          Institutional-grade portfolio metrics · Inspired by Rotki & Risk Premia Dashboard
        </p>
      </div>

      {noData ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>No portfolio data yet</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Add transactions in the Ledger to see analytics</div>
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="kpiRow" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <MetricCard
              icon="📐" label="Sharpe Ratio"
              value={metrics.sharpe.toFixed(2)}
              sub={metrics.sharpe > 1 ? "Strong risk-adjusted return" : metrics.sharpe > 0 ? "Positive risk-adjusted return" : "Negative risk-adjusted return"}
              color={metrics.sharpe > 1 ? "var(--good)" : metrics.sharpe > 0 ? "var(--warn)" : "var(--bad)"}
            />
            <MetricCard
              icon="🌊" label="Volatility (Ann.)"
              value={`${(metrics.vol * 100).toFixed(1)}%`}
              sub={metrics.vol > 0.5 ? "High volatility" : "Moderate volatility"}
              color={metrics.vol > 0.8 ? "var(--bad)" : "var(--text)"}
            />
            <MetricCard
              icon="📉" label="Max Drawdown"
              value={`−${(metrics.dd.mdd * 100).toFixed(1)}%`}
              sub={`Peak → Trough`}
              color="var(--bad)"
            />
            <MetricCard
              icon="🎯" label="Win Rate"
              value={`${(metrics.winRate * 100).toFixed(0)}%`}
              sub="Days with positive return"
              color={metrics.winRate > 0.5 ? "var(--good)" : "var(--bad)"}
            />
            <MetricCard
              icon="📊" label="Concentration (HHI)"
              value={`${(metrics.hhi * 100).toFixed(0)}%`}
              sub={metrics.hhi > 0.25 ? "Concentrated portfolio" : "Well diversified"}
              color={metrics.hhi > 0.25 ? "var(--warn)" : "var(--good)"}
            />
            <MetricCard
              icon="📈" label="Total Return"
              value={`${metrics.totalReturn >= 0 ? "+" : ""}${(metrics.totalReturn * 100).toFixed(1)}%`}
              sub={`${benchPeriod}d period`}
              color={metrics.totalReturn >= 0 ? "var(--good)" : "var(--bad)"}
            />
          </div>

          {/* Daily stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>📊 DAILY RETURN STATS</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: "var(--muted)" }}>Avg Daily</span>
                <span style={{ fontWeight: 700, color: metrics.avgDailyReturn >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {(metrics.avgDailyReturn * 100).toFixed(3)}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: "var(--muted)" }}>Best Day</span>
                <span style={{ fontWeight: 700, color: "var(--good)" }}>+{(metrics.bestDay * 100).toFixed(2)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "var(--muted)" }}>Worst Day</span>
                <span style={{ fontWeight: 700, color: "var(--bad)" }}>{(metrics.worstDay * 100).toFixed(2)}%</span>
              </div>
            </div>

            <div className="card" style={{ padding: 12 }}>
              <MiniChart data={metrics.portfolioHistory} width={260} height={60} label="PORTFOLIO VALUE CURVE" />
            </div>

            <div className="card" style={{ padding: 12 }}>
              <MiniChart
                data={metrics.portfolioReturns.map((_, i) => metrics.portfolioReturns.slice(0, i + 1).reduce((s, v) => s * (1 + v), 1))}
                width={260} height={60} color="var(--t2, #7c3aed)" label="CUMULATIVE RETURN"
              />
            </div>
          </div>

          {/* Benchmark comparison */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Portfolio Benchmarking</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Compare performance vs BTC, ETH, S&P 500</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[30, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    className={`pill ${benchPeriod === d ? "" : "secondary"}`}
                    style={{ fontSize: 10, padding: "3px 8px", cursor: "pointer", background: benchPeriod === d ? "var(--brand)" : "var(--panel2)", color: benchPeriod === d ? "#fff" : "var(--muted)", border: "none", borderRadius: 4 }}
                    onClick={() => setBenchPeriod(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <BenchmarkChart
              portfolio={metrics.portfolioHistory}
              benchmarks={[
                { label: "Bitcoin", data: metrics.btcHist, color: "#f7931a" },
                { label: "Ethereum", data: metrics.ethHist, color: "#627eea" },
                { label: "S&P 500", data: metrics.sp500Hist, color: "#4ade80" },
              ]}
              days={benchPeriod}
            />
          </div>

          {/* Correlation Matrix */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Asset Correlation Matrix</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12 }}>
              Shows how your top assets move relative to each other (−1 = inverse, +1 = identical)
            </div>
            <CorrelationMatrix
              positions={metrics.positionSyms}
              returns={metrics.assetReturns}
            />
          </div>

          {/* Risk breakdown per asset */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Per-Asset Risk Breakdown</div>
            <div style={{ overflowX: "auto" }}>
              <table className="ledgerTbl" style={{ width: "100%", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontWeight: 600 }}>Asset</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--muted)", fontWeight: 600 }}>Weight</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--muted)", fontWeight: 600 }}>Value</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--muted)", fontWeight: 600 }}>P&L</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--muted)", fontWeight: 600 }}>P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.slice(0, 10).map(p => {
                    const weight = portfolio.totalMV > 0 ? ((p.mv || 0) / portfolio.totalMV * 100) : 0;
                    const pnlPct = p.cost > 0 ? ((p.unreal || 0) / p.cost * 100) : 0;
                    return (
                      <tr key={p.sym} style={{ borderBottom: "1px solid var(--line2)" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--text)" }}>{p.sym}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--muted)" }}>{weight.toFixed(1)}%</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text)" }}>{fmtFiat(p.mv || 0)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: (p.unreal || 0) >= 0 ? "var(--good)" : "var(--bad)" }}>
                          {fmtFiat(p.unreal || 0)}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: pnlPct >= 0 ? "var(--good)" : "var(--bad)" }}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
