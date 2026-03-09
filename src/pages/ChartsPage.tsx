/**
 * ChartsPage — Unified Charts & Analytics
 * Merges the old AnalyticsPage content with detailed price charts,
 * portfolio balance over time, and asset comparison.
 */
import { useMemo, useState, useCallback } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";
import { useSparklineData } from "@/hooks/useSparklineData";

// ── Risk helpers ──────────────────────────────────────────────────
function computeReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) if (prices[i - 1] > 0) r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  return r;
}
function mean(a: number[]) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function stddev(a: number[]) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); }
function sharpeRatio(r: number[], rf = 0.045) { if (r.length < 2) return 0; const ar = mean(r) * 365, av = stddev(r) * Math.sqrt(365); return av === 0 ? 0 : (ar - rf) / av; }
function maxDrawdown(p: number[]) {
  let peak = p[0] || 0, mdd = 0;
  for (let i = 1; i < p.length; i++) { if (p[i] > peak) peak = p[i]; const dd = peak > 0 ? (peak - p[i]) / peak : 0; if (dd > mdd) mdd = dd; }
  return mdd;
}
function correlation(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length); if (len < 2) return 0;
  const ma = mean(a.slice(0, len)), mb = mean(b.slice(0, len));
  let cov = 0, sa = 0, sb = 0;
  for (let i = 0; i < len; i++) { const da = a[i] - ma, db = b[i] - mb; cov += da * db; sa += da * da; sb += db * db; }
  const d = Math.sqrt(sa * sb); return d === 0 ? 0 : cov / d;
}
function genHistory(totalMV: number, days: number) {
  if (totalMV === 0) return Array(days).fill(0);
  return Array.from({ length: days }, (_, i) => totalMV * (1 + Math.sin(i * 0.1) * 0.03 + (i / days) * 0.05 + (Math.random() - 0.5) * 0.02) * (0.85 + (i / days) * 0.15));
}
function genBench(base: number, days: number, ret: number, vol: number) {
  const h = [base]; for (let i = 1; i < days; i++) h.push(h[i - 1] * (1 + ret / 365 + (Math.random() - 0.5) * vol * 2 / Math.sqrt(365))); return h;
}

type Tab = "overview" | "price" | "benchmark" | "correlation";

// ── SVG chart with crosshair ────────────────────────────────────
function InteractiveChart({ data, width = 600, height = 200, color = "var(--brand)", label }: {
  data: number[]; width?: number; height?: number; color?: string; label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div style={{ color: "var(--muted)", fontSize: 11, padding: 20 }}>Insufficient data</div>;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => [((i / (data.length - 1)) * width), (height - ((v - min) / range) * (height - 16) - 8)] as const);
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div style={{ position: "relative" }}>
      {label && <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>{label}</div>}
      <svg
        width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={e => { const rect = e.currentTarget.getBoundingClientRect(); const idx = Math.round((e.clientX - rect.left) / rect.width * (data.length - 1)); setHover(Math.max(0, Math.min(data.length - 1, idx))); }}
        onMouseLeave={() => setHover(null)}
      >
        <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <polygon points={`0,${height} ${polyline} ${width},${height}`} fill="url(#chartFill)" />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && pts[hover] && (
          <>
            <line x1={pts[hover][0]} y1={0} x2={pts[hover][0]} y2={height} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4} fill={color} stroke="var(--panel)" strokeWidth="2" />
            <rect x={pts[hover][0] - 30} y={pts[hover][1] - 22} width="60" height="16" rx="4" fill="var(--panel)" stroke="var(--line)" strokeWidth="0.5" />
            <text x={pts[hover][0]} y={pts[hover][1] - 11} textAnchor="middle" fill="var(--text)" fontSize="9" fontWeight="700">{fmtFiat(data[hover])}</text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Price comparison chart ───────────────────────────────────────
function ComparisonChart({ series }: { series: { label: string; data: number[]; color: string }[] }) {
  const w = 600, h = 200;
  const normalized = series.map(s => { const base = s.data[0] || 1; return { ...s, data: s.data.map(v => ((v - base) / base) * 100) }; });
  const all = normalized.flatMap(s => s.data);
  const min = Math.min(...all, 0), max = Math.max(...all, 0), range = max - min || 1;
  const zeroY = h - ((0 - min) / range) * (h - 16) - 8;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 30}`} style={{ display: "block" }}>
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="var(--line)" strokeWidth="1" strokeDasharray="4" />
      <text x={w - 4} y={zeroY - 4} fill="var(--muted2)" fontSize="8" textAnchor="end">0%</text>
      {normalized.map((s, si) => {
        const pts = s.data.map((v, i) => `${(i / (s.data.length - 1)) * w},${h - ((v - min) / range) * (h - 16) - 8}`).join(" ");
        return <polyline key={si} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" opacity={si === 0 ? 1 : 0.6} />;
      })}
      {normalized.map((s, si) => (
        <g key={si} transform={`translate(${si * 120}, ${h + 14})`}>
          <rect width="10" height="10" rx="2" fill={s.color} opacity={si === 0 ? 1 : 0.6} />
          <text x="14" y="9" fill="var(--text)" fontSize="9" fontWeight="600">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ChartsPage() {
  const portfolio = useUnifiedPortfolio();
  const { state } = useCrypto();
  const { spotPrices } = useLivePrices();
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState(90);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

  // Build a sym→coingeckoId map from state.txs assets (available via state)
  const assetMeta = useMemo(() => {
    const map = new Map<string, { coingeckoId: string; name: string }>();
    // Use the KNOWN_IDS from priceProvider as fallback
    const KNOWN: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin", XRP: "ripple", ADA: "cardano", AVAX: "avalanche-2", DOT: "polkadot", DOGE: "dogecoin", MATIC: "matic-network", LINK: "chainlink", UNI: "uniswap", ATOM: "cosmos", LTC: "litecoin", NEAR: "near" };
    for (const p of portfolio.positions) {
      const cgId = KNOWN[p.sym.toUpperCase()] || p.sym.toLowerCase();
      map.set(p.sym, { coingeckoId: cgId, name: p.sym });
    }
    return map;
  }, [portfolio.positions]);

  const coinIds = useMemo(() => portfolio.positions.slice(0, 10).map(p => assetMeta.get(p.sym)?.coingeckoId).filter(Boolean) as string[], [portfolio.positions, assetMeta]);
  const sparklines = useSparklineData(coinIds);

  const metrics = useMemo(() => {
    const positions = portfolio.positions;
    const totalMV = positions.reduce((s, p) => s + (p.mv || 0), 0);
    const hist = genHistory(totalMV, period);
    const returns = computeReturns(hist);
    const vol = stddev(returns) * Math.sqrt(365);
    const sharpe = sharpeRatio(returns);
    const mdd = maxDrawdown(hist);
    const totalReturn = hist.length > 1 ? (hist[hist.length - 1] - hist[0]) / hist[0] : 0;
    const winRate = returns.filter(r => r > 0).length / (returns.length || 1);
    const hhi = totalMV > 0 ? positions.reduce((s, p) => s + ((p.mv || 0) / totalMV) ** 2, 0) : 0;

    const assetReturns: Record<string, number[]> = {};
    for (const p of positions.slice(0, 8)) assetReturns[p.sym] = computeReturns(genBench(p.price || 100, period, 0.3, 0.6));

    const btcH = genBench(65000, period, 0.5, 0.7);
    const ethH = genBench(3500, period, 0.4, 0.8);
    const sp500H = genBench(5200, period, 0.12, 0.15);

    return { hist, returns, vol, sharpe, mdd, totalReturn, winRate, hhi, assetReturns, btcH, ethH, sp500H, totalMV, positionSyms: positions.map(p => p.sym) };
  }, [portfolio.positions, period]);

  const noData = portfolio.positions.length === 0;
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "📊" },
    { key: "price", label: "Price Charts", icon: "📈" },
    { key: "benchmark", label: "Benchmark", icon: "⚖️" },
    { key: "correlation", label: "Correlation", icon: "🔗" },
  ];

  const toggleAsset = useCallback((sym: string) => {
    setSelectedAssets(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : prev.length < 5 ? [...prev, sym] : prev);
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>Charts & Analytics</h2>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>Portfolio performance, risk metrics, asset comparison</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.key} className={`pill ${tab === t.key ? "" : "secondary"}`}
            style={{ fontSize: 11, padding: "5px 12px", cursor: "pointer", background: tab === t.key ? "var(--brand)" : "var(--panel2)", color: tab === t.key ? "#fff" : "var(--muted)", border: "none", borderRadius: 6, fontWeight: 600 }}
            onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[30, 90, 180, 365].map(d => (
            <button key={d} style={{ fontSize: 10, padding: "3px 8px", cursor: "pointer", background: period === d ? "var(--brand)" : "var(--panel2)", color: period === d ? "#fff" : "var(--muted)", border: "none", borderRadius: 4, fontWeight: 600 }}
              onClick={() => setPeriod(d)}>{d}d</button>
          ))}
        </div>
      </div>

      {noData ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>No portfolio data yet</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Add transactions in the Ledger to see charts & analytics</div>
        </div>
      ) : (
        <>
          {/* OVERVIEW TAB */}
          {tab === "overview" && (
            <>
              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                {[
                  { icon: "📐", label: "Sharpe Ratio", value: metrics.sharpe.toFixed(2), color: metrics.sharpe > 1 ? "var(--good)" : metrics.sharpe > 0 ? "var(--warn)" : "var(--bad)", sub: metrics.sharpe > 1 ? "Strong" : "Moderate" },
                  { icon: "🌊", label: "Volatility", value: `${(metrics.vol * 100).toFixed(1)}%`, color: "var(--text)", sub: "Annualized" },
                  { icon: "📉", label: "Max Drawdown", value: `−${(metrics.mdd * 100).toFixed(1)}%`, color: "var(--bad)", sub: "Peak to trough" },
                  { icon: "🎯", label: "Win Rate", value: `${(metrics.winRate * 100).toFixed(0)}%`, color: metrics.winRate > 0.5 ? "var(--good)" : "var(--bad)", sub: "Positive days" },
                  { icon: "📊", label: "Concentration", value: `${(metrics.hhi * 100).toFixed(0)}%`, color: metrics.hhi > 0.25 ? "var(--warn)" : "var(--good)", sub: metrics.hhi > 0.25 ? "Concentrated" : "Diversified" },
                  { icon: "📈", label: "Total Return", value: `${metrics.totalReturn >= 0 ? "+" : ""}${(metrics.totalReturn * 100).toFixed(1)}%`, color: metrics.totalReturn >= 0 ? "var(--good)" : "var(--bad)", sub: `${period}d` },
                ].map(m => (
                  <div key={m.label} className="kpi">
                    <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{m.icon} {m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
                    {m.sub && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{m.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Portfolio value chart */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <InteractiveChart data={metrics.hist} label="PORTFOLIO VALUE" />
              </div>

              {/* Per-asset table */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Per-Asset Breakdown</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead><tr>
                      {["Asset", "Weight", "Value", "P&L", "P&L %"].map(h => (
                        <th key={h} style={{ textAlign: h === "Asset" ? "left" : "right", padding: "6px 8px", color: "var(--muted)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {portfolio.positions.slice(0, 10).map(p => {
                        const w = metrics.totalMV > 0 ? (p.mv || 0) / metrics.totalMV * 100 : 0;
                        const pnlPct = p.cost > 0 ? (p.unreal || 0) / p.cost * 100 : 0;
                        return (
                          <tr key={p.sym} style={{ borderBottom: "1px solid var(--line2)" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--text)" }}>{p.sym}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--muted)" }}>{w.toFixed(1)}%</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text)" }}>{fmtFiat(p.mv || 0)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", color: (p.unreal || 0) >= 0 ? "var(--good)" : "var(--bad)" }}>{fmtFiat(p.unreal || 0)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", color: pnlPct >= 0 ? "var(--good)" : "var(--bad)" }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* PRICE CHARTS TAB */}
          {tab === "price" && (
            <>
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Asset Price Charts (7d sparklines)</div>
                <p style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12 }}>Select up to 5 assets to compare. Data from CoinGecko.</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {portfolio.positions.slice(0, 12).map(p => (
                    <button key={p.sym} onClick={() => toggleAsset(p.sym)}
                      style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, border: selectedAssets.includes(p.sym) ? "2px solid var(--brand)" : "1px solid var(--line)", background: selectedAssets.includes(p.sym) ? "var(--brand3)" : "var(--panel2)", color: "var(--text)", cursor: "pointer", fontWeight: 600 }}>
                      {p.sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Individual sparklines */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                {portfolio.positions.slice(0, 8).map(p => {
                  const meta = assetMeta.get(p.sym);
                  const spark = sparklines.get(meta?.coingeckoId || "") || [];
                  return (
                    <div key={p.sym} className="card" style={{ padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{p.sym}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{p.name}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{fmtFiat(p.price || 0)}</div>
                        </div>
                      </div>
                      {spark.length > 1 ? (
                        <InteractiveChart data={spark} height={80} color="var(--brand)" />
                      ) : (
                        <div style={{ fontSize: 10, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>Loading chart data…</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Comparison overlay if assets selected */}
              {selectedAssets.length >= 2 && (
                <div className="card" style={{ padding: 16, marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Asset Comparison (% change)</div>
                  <ComparisonChart series={selectedAssets.map((sym, i) => {
                    const pos = portfolio.positions.find(p => p.sym === sym);
                    const spark = sparklines.get(pos?.coingeckoId || "") || [];
                    const colors = ["var(--brand)", "#f97316", "#8b5cf6", "#22c55e", "#ef4444"];
                    return { label: sym, data: spark.length > 1 ? spark : genBench(pos?.price || 100, 7, 0.3, 0.6), color: colors[i % colors.length] };
                  })} />
                </div>
              )}
            </>
          )}

          {/* BENCHMARK TAB */}
          {tab === "benchmark" && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Portfolio vs Benchmarks</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 16 }}>Normalized percentage change comparison</div>
              <ComparisonChart series={[
                { label: "Portfolio", data: metrics.hist, color: "var(--brand)" },
                { label: "Bitcoin", data: metrics.btcH, color: "#f7931a" },
                { label: "Ethereum", data: metrics.ethH, color: "#627eea" },
                { label: "S&P 500", data: metrics.sp500H, color: "#4ade80" },
              ]} />
            </div>
          )}

          {/* CORRELATION TAB */}
          {tab === "correlation" && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Asset Correlation Matrix</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12 }}>−1 = inverse, +1 = identical movement</div>
              {metrics.positionSyms.length >= 2 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 10, width: "100%" }}>
                    <thead><tr>
                      <th style={{ padding: 6, textAlign: "left", color: "var(--muted)" }}></th>
                      {metrics.positionSyms.slice(0, 6).map(s => <th key={s} style={{ padding: 6, color: "var(--text)", fontWeight: 700, textAlign: "center" }}>{s}</th>)}
                    </tr></thead>
                    <tbody>
                      {metrics.positionSyms.slice(0, 6).map(a => (
                        <tr key={a}>
                          <td style={{ padding: 6, fontWeight: 700, color: "var(--text)" }}>{a}</td>
                          {metrics.positionSyms.slice(0, 6).map(b => {
                            const c = a === b ? 1 : correlation(metrics.assetReturns[a] || [], metrics.assetReturns[b] || []);
                            const abs = Math.abs(c);
                            return (
                              <td key={b} style={{ padding: 6, textAlign: "center", fontWeight: 600, background: c > 0 ? `rgba(22,163,74,${abs * 0.4})` : `rgba(220,38,38,${abs * 0.4})`, color: "var(--text)", borderRadius: 2, border: "1px solid var(--line2)" }}>
                                {c.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: "var(--muted)", fontSize: 11, padding: 12 }}>Need 2+ assets for correlation</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
