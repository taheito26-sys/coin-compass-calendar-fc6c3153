import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useMemo } from "react";

const COIN_COLORS = [
  "#f97316", "#3b82f6", "#8b5cf6", "#ef4444", "#22c55e",
  "#06b6d4", "#ec4899", "#eab308", "#14b8a6", "#f43f5e",
  "#6366f1", "#84cc16", "#0ea5e9", "#d946ef", "#fb923c",
];

interface DonutSlice {
  label: string;
  value: number;
  pct: number;
  color: string;
}

function DonutChart({ slices, centerLabel, centerValue, centerSub, size = 200 }: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  centerSub: string;
  size?: number;
}) {
  const r = size / 2;
  const strokeW = size * 0.15;
  const innerR = r - strokeW / 2 - 4;
  const circumference = 2 * Math.PI * innerR;

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const dashLen = (s.pct / 100) * circumference;
    const dashOffset = -offset;
    offset += dashLen;
    return (
      <circle
        key={i}
        cx={r}
        cy={r}
        r={innerR}
        fill="none"
        stroke={s.color}
        strokeWidth={strokeW}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    );
  });

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={r} cy={r} r={innerR} fill="none" stroke="var(--line)" strokeWidth={strokeW} />
        {arcs}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8,
      }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{centerLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{centerValue}</div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>{centerSub}</div>
      </div>
    </div>
  );
}

function DonutLegend({ slices }: { slices: DonutSlice[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", alignContent: "center" }}>
      {slices.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: s.color }} />
          <span style={{ fontWeight: 700, fontSize: 12, minWidth: 40 }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{s.pct.toFixed(s.pct < 1 ? 2 : 1)}%</span>
        </div>
      ))}
    </div>
  );
}

function HeatmapBlock({ sym, value, pct, color }: { sym: string; value: string; pct: string; color: string }) {
  return (
    <div style={{
      background: color,
      borderRadius: "var(--lt-radius-sm)",
      padding: "12px 8px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 2, minHeight: 80, transition: "transform 0.15s", cursor: "default",
    }}
    onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div style={{ fontWeight: 900, fontSize: 14, color: "#fff" }}>{sym}</div>
      <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.75)" }}>{pct}</div>
    </div>
  );
}

export default function DashboardPage({ onNav }: { onNav?: (p: string) => void }) {
  const { state } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const { positions, totalMV, totalCost, totalPnl, totalPnlPct, realizedPnl, assetCount, txCount } = portfolio;
  const base = portfolio.base;
  const method = portfolio.method;

  // Coin allocation slices
  const coinSlices = useMemo((): DonutSlice[] => {
    if (totalMV <= 0) return [];
    const topCoins = positions.filter(r => r.mv !== null && (r.mv ?? 0) > 0).slice(0, 12);
    const topTotal = topCoins.reduce((s, r) => s + (r.mv || 0), 0);
    const rest = totalMV - topTotal;
    const slices = topCoins.map((r, i) => ({
      label: r.sym,
      value: r.mv || 0,
      pct: ((r.mv || 0) / totalMV) * 100,
      color: COIN_COLORS[i % COIN_COLORS.length],
    }));
    if (rest > 0.01) {
      slices.push({ label: "Other", value: rest, pct: (rest / totalMV) * 100, color: "var(--muted2)" });
    }
    return slices;
  }, [positions, totalMV]);

  // Heatmap
  const heatmapItems = useMemo(() => {
    return positions
      .filter(r => r.mv !== null)
      .map(r => {
        const pnlPct = r.cost > 0 ? ((r.unreal || 0) / r.cost) * 100 : 0;
        const isPositive = (r.unreal || 0) >= 0;
        const intensity = Math.min(Math.abs(pnlPct) / 50, 1);
        const bg = isPositive
          ? `rgba(22,163,74,${0.3 + intensity * 0.5})`
          : `rgba(220,38,38,${0.3 + intensity * 0.5})`;
        return {
          sym: r.sym,
          value: fmtTotal(r.mv || 0),
          pct: (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%",
          color: bg,
          mv: r.mv || 0,
        };
      })
      .sort((a, b) => b.mv - a.mv)
      .slice(0, 9);
  }, [positions, base]);

  // Watchlist with live prices
  const watchlistData = useMemo(() => {
    return state.watch.map(sym => {
      const live = getPrice(sym);
      return {
        sym,
        price: live?.current_price ?? null,
        change24h: live?.price_change_percentage_24h_in_currency ?? null,
        change7d: live?.price_change_percentage_7d_in_currency ?? null,
      };
    });
  }, [state.watch, getPrice]);

  // Recent activity from transactions
  const recentTxs = useMemo(() => {
    return state.txs
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [state.txs]);

  // Top gainers/losers
  const { topGainers, topLosers } = useMemo(() => {
    const withPnl = positions
      .filter(r => r.unreal !== null && r.cost > 0)
      .map(r => ({
        sym: r.sym,
        pnlPct: r.cost > 0 ? ((r.unreal || 0) / r.cost) * 100 : 0,
        pnlAbs: r.unreal || 0,
      }));
    const sorted = [...withPnl].sort((a, b) => b.pnlPct - a.pnlPct);
    return {
      topGainers: sorted.filter(x => x.pnlPct > 0).slice(0, 3),
      topLosers: sorted.filter(x => x.pnlPct < 0).slice(-3).reverse(),
    };
  }, [positions]);

  const topCoin = coinSlices.length > 0 ? coinSlices[0] : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span className="pill">{base}</span>
      </div>

      {/* KPI Cards */}
      <div className="kpis kpis-5">
        <div className="kpi-card">
          <div className="kpi-head">
            <span className="kpi-badge" style={{ color: "var(--brand)", borderColor: "color-mix(in srgb,var(--brand) 30%,transparent)", background: "var(--brand3)" }}>{base}</span>
          </div>
          <div className="kpi-lbl">PORTFOLIO VALUE</div>
          <div className="kpi-val">{fmtTotal(totalMV)}</div>
          <div className="kpi-sub">{assetCount} assets tracked</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <span className={`kpi-badge ${totalPnl >= 0 ? "+" : "-"}`}>{totalPnl >= 0 ? "▲" : "▼"}</span>
          </div>
          <div className="kpi-lbl">UNREALIZED P&L</div>
          <div className={`kpi-val ${totalPnl >= 0 ? "good" : "bad"}`}>
            {(totalPnl >= 0 ? "+" : "") + fmtTotal(totalPnl)}
          </div>
          <div className="kpi-sub">
            {totalCost > 0 ? totalPnlPct.toFixed(2) + "%" : "-"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">REALIZED P&L</div>
          <div className={`kpi-val ${realizedPnl >= 0 ? "good" : "bad"}`}>
            {(realizedPnl >= 0 ? "+" : "") + fmtTotal(realizedPnl)}
          </div>
          <div className="kpi-sub">From closed trades</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">TOTAL COST</div>
          <div className="kpi-val">{fmtFiat(totalCost, base)}</div>
          <div className="kpi-sub">{txCount} transactions</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">METHOD</div>
          <div className="kpi-val" style={{ fontSize: 16 }}>{method}</div>
          <div className="kpi-sub">{assetCount > 0 ? "All priced OK" : "No positions"}</div>
        </div>
      </div>

      {/* Charts Row: Coin Allocation + Heatmap */}
      <div className="dashboard-charts-grid">
        <div className="panel">
          <div className="panel-head"><h2>Coin Allocation</h2></div>
          <div className="panel-body" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            {coinSlices.length > 0 ? (
              <>
                <DonutChart
                  slices={coinSlices}
                  centerLabel={topCoin?.label || "-"}
                  centerValue={fmtFiat(topCoin?.value || 0, base).split(" ")[0]}
                  centerSub={topCoin ? topCoin.pct.toFixed(1) + "%" : ""}
                  size={180}
                />
                <DonutLegend slices={coinSlices} />
              </>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: "center", width: "100%" }}>
                No positions. Add transactions in the Ledger.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Heatmap</h2></div>
          <div className="panel-body">
            {heatmapItems.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {heatmapItems.map((item, i) => (
                  <HeatmapBlock key={i} sym={item.sym} value={"$" + item.value} pct={item.pct} color={item.color} />
                ))}
              </div>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                No positions to display.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gainers/Losers + Watchlist Row */}
      <div className="dashboard-charts-grid">
        {/* Top Gainers/Losers */}
        <div className="panel">
          <div className="panel-head"><h2>Top Movers</h2></div>
          <div className="panel-body" style={{ padding: 0 }}>
            {(topGainers.length > 0 || topLosers.length > 0) ? (
              <table>
                <thead>
                  <tr><th>Asset</th><th style={{ textAlign: "right" }}>P&L %</th><th style={{ textAlign: "right" }}>P&L</th></tr>
                </thead>
                <tbody>
                  {topGainers.map(g => (
                    <tr key={g.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{g.sym}</td>
                      <td className="mono good" style={{ textAlign: "right", fontWeight: 700 }}>▲ {g.pnlPct.toFixed(2)}%</td>
                      <td className="mono good" style={{ textAlign: "right" }}>+{fmtFiat(g.pnlAbs, base)}</td>
                    </tr>
                  ))}
                  {topLosers.map(l => (
                    <tr key={l.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{l.sym}</td>
                      <td className="mono bad" style={{ textAlign: "right", fontWeight: 700 }}>▼ {Math.abs(l.pnlPct).toFixed(2)}%</td>
                      <td className="mono bad" style={{ textAlign: "right" }}>{fmtFiat(l.pnlAbs, base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>No movers yet.</div>
            )}
          </div>
        </div>

        {/* Watchlist */}
        <div className="panel">
          <div className="panel-head">
            <h2>Watchlist</h2>
            <span className="pill">{watchlistData.length} coins</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {watchlistData.length > 0 ? (
              <table>
                <thead>
                  <tr><th>Coin</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>24h</th><th style={{ textAlign: "right" }}>7d</th></tr>
                </thead>
                <tbody>
                  {watchlistData.map(w => (
                    <tr key={w.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{w.sym}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{w.price !== null ? "$" + fmtPx(w.price) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {w.change24h !== null ? (
                          <span className={`mono ${w.change24h >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
                            {w.change24h >= 0 ? "▲" : "▼"} {Math.abs(w.change24h).toFixed(2)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {w.change7d !== null ? (
                          <span className={`mono ${w.change7d >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
                            {w.change7d >= 0 ? "▲" : "▼"} {Math.abs(w.change7d).toFixed(2)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                Add coins to your watchlist in Markets.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Positions + Recent Activity */}
      <div className="dash-bottom" style={{ marginTop: 10 }}>
        {/* Top Positions Table */}
        <div className="panel">
          <div className="panel-head">
            <h2>Top Positions</h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="pill">{positions.length} assets</span>
              {onNav && <button className="btn tiny secondary" onClick={() => onNav("assets")}>View All →</button>}
            </div>
          </div>
          <div className="panel-body" style={{ padding: 0, overflow: "auto" }}>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr><th>Asset</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>MV</th><th>Unreal P&L</th></tr>
                </thead>
                <tbody>
                  {positions.length ? positions.slice(0, 10).map(r => (
                    <tr key={r.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                      <td className="mono">{fmtQty(r.qty)}</td>
                      <td className="mono">{fmtPx(r.avg)} {base}</td>
                      <td className="mono">{r.price === null ? "-" : fmtPx(r.price) + " " + base}</td>
                      <td className="mono">{r.mv === null ? "-" : fmtFiat(r.mv, base)}</td>
                      <td className={`mono ${r.unreal === null ? "" : r.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                        {r.unreal === null ? "-" : (r.unreal >= 0 ? "+" : "") + fmtFiat(r.unreal, base)}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="muted">No positions yet. Add transactions in the Ledger.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="panel">
          <div className="panel-head">
            <h2>Recent Activity</h2>
            {onNav && <button className="btn tiny secondary" onClick={() => onNav("ledger")}>Ledger →</button>}
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {recentTxs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {recentTxs.map(tx => (
                  <div key={tx.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", borderBottom: "1px solid var(--line)",
                    fontSize: 11,
                  }}>
                    <span className={`pill ${tx.type === "buy" ? "good" : tx.type === "sell" ? "bad" : ""}`} style={{ fontSize: 9, minWidth: 36, textAlign: "center" }}>
                      {tx.type.toUpperCase()}
                    </span>
                    <span className="mono" style={{ fontWeight: 900, minWidth: 40 }}>{tx.asset}</span>
                    <span className="mono muted" style={{ flex: 1 }}>{fmtQty(tx.qty)}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {new Date(tx.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                No recent activity.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
