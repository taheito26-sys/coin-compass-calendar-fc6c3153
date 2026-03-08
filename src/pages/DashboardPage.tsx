import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { usePortfolio } from "@/hooks/usePortfolio";
import { mergePositionSources } from "@/lib/mergePositions";
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

export default function DashboardPage() {
  const portfolio = usePortfolio();
  const { state, refresh } = useCrypto();
  const localD = cryptoDerived(state);

  // Merged local-first dataset
  const workerReady = portfolio.authenticated && !portfolio.error && !portfolio.loading;
  const hasWorkerData = workerReady && portfolio.positions.length > 0;

  const rows = useMemo(() => {
    return mergePositionSources(localD.rows, portfolio.positions, hasWorkerData);
  }, [localD.rows, portfolio.positions, hasWorkerData]);

  const hasLocalOnly = rows.some(r => r.source === "local");

  // Compute totals from merged dataset
  const totalMV = rows.reduce((s, r) => s + (r.mv ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const assetCount = rows.length;
  const base = state.base || "USD";
  const method = state.method || "FIFO";

  const priceAge = useMemo(() => {
    if (hasWorkerData) return portfolio.priceAge;
    if (localD.priceAgeMs < 60000) return Math.round(localD.priceAgeMs / 1000) + "s";
    return Math.round(localD.priceAgeMs / 60000) + "m";
  }, [hasWorkerData, portfolio.priceAge, localD.priceAgeMs]);

  const txCount = hasWorkerData ? portfolio.txCount : state.lots.length;

  // Coin allocation slices
  const coinSlices = useMemo((): DonutSlice[] => {
    if (totalMV <= 0) return [];
    const topCoins = rows.filter(r => r.mv !== null && (r.mv ?? 0) > 0).slice(0, 12);
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
  }, [rows, totalMV]);

  // Heatmap
  const heatmapItems = useMemo(() => {
    return rows
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
          value: fmtFiat(r.mv || 0, base).split(" ")[0],
          pct: (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%",
          color: bg,
          mv: r.mv || 0,
        };
      })
      .sort((a, b) => b.mv - a.mv)
      .slice(0, 9);
  }, [rows, base]);

  const topCoin = coinSlices.length > 0 ? coinSlices[0] : null;

  const handleRefresh = async () => {
    await Promise.all([portfolio.refresh(), refresh(true)]);
  };

  return (
    <>
      {/* Source indicator */}
      {portfolio.loading && (
        <div className="pill" style={{ marginBottom: 8 }}>Loading data...</div>
      )}
      {!portfolio.loading && !portfolio.authenticated && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body muted" style={{ fontSize: 12 }}>Not signed in, showing local data only. Sign in to sync your portfolio.</div>
        </div>
      )}
      {hasLocalOnly && portfolio.authenticated && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body" style={{ fontSize: 12, color: "var(--warn)" }}>
            Some assets are local only — they'll sync once the backend maps them.
          </div>
        </div>
      )}
      {portfolio.error && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-body" style={{ fontSize: 12, color: "var(--bad)" }}>
            API error: {portfolio.error}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn secondary" onClick={handleRefresh} style={{ padding: "6px 10px", fontSize: 11 }}>Refresh</button>
        <span className="pill">Prices: {priceAge} ago</span>
        <span className="pill">{base}</span>
        {portfolio.workerOnline && (
          <span className="pill" style={{
            background: "hsl(142 76% 36% / 0.15)",
            color: "hsl(142 76% 36%)",
            fontWeight: 700,
            fontSize: 10,
          }}>Worker Online</span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="kpis">
        <div className="kpi-card">
          <div className="kpi-head">
            <span className="kpi-badge" style={{ color: "var(--brand)", borderColor: "color-mix(in srgb,var(--brand) 30%,transparent)", background: "var(--brand3)" }}>{base}</span>
          </div>
          <div className="kpi-lbl">PORTFOLIO VALUE</div>
          <div className="kpi-val">{fmtFiat(totalMV, base)}</div>
          <div className="kpi-sub">{assetCount} assets tracked</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <span className={`kpi-badge ${totalPnl >= 0 ? "+" : "-"}`}>{totalPnl >= 0 ? "▲" : "▼"}</span>
          </div>
          <div className="kpi-lbl">UNREALIZED P&L</div>
          <div className={`kpi-val ${totalPnl >= 0 ? "good" : "bad"}`}>
            {(totalPnl >= 0 ? "+" : "") + fmtFiat(totalPnl, base)}
          </div>
          <div className="kpi-sub">
            {totalCost > 0 ? totalPnlPct.toFixed(2) + "%" : "-"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">TOTAL COST</div>
          <div className="kpi-val">{fmtFiat(totalCost, base)}</div>
          <div className="kpi-sub">{txCount} {hasWorkerData ? "transactions" : "lots"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">METHOD</div>
          <div className="kpi-val" style={{ fontSize: 16 }}>{method}</div>
          <div className="kpi-sub">{assetCount > 0 ? "All priced OK" : "No positions"}</div>
        </div>
      </div>

      {/* Coin Allocation + Heatmap */}
      <div className="dashboard-charts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
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

      {/* Top Positions Table */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>Top Positions</h2><span className="pill">{rows.length} assets</span></div>
        <div className="panel-body" style={{ padding: 0, overflow: "auto" }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>Asset</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>MV</th><th>Unreal P&L</th><th>Source</th></tr>
              </thead>
              <tbody>
                {rows.length ? rows.map(r => {
                  const avg = r.qty > 0 ? r.cost / r.qty : 0;
                  return (
                    <tr key={r.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                      <td className="mono">{fmtQty(r.qty)}</td>
                      <td className="mono">{fmtPx(avg)} {base}</td>
                      <td className="mono">{r.price === null ? "-" : fmtPx(r.price) + " " + base}</td>
                      <td className="mono">{r.mv === null ? "-" : fmtFiat(r.mv, base)}</td>
                      <td className={`mono ${r.unreal === null ? "" : r.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                        {r.unreal === null ? "-" : (r.unreal >= 0 ? "+" : "") + fmtFiat(r.unreal, base)}
                      </td>
                      <td>
                        <span className="pill" style={{ fontSize: 9 }}>
                          {r.source === "local" ? "Local" : r.source === "worker" ? "Synced" : "Merged"}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} className="muted">No positions yet. Add transactions in the Ledger.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
