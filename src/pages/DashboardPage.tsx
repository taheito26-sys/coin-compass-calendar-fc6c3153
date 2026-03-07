import { useCrypto } from "@/lib/cryptoContext";
import { cryptoDerived, fmtFiat, fmtQty, fmtPx, type DerivedPosition } from "@/lib/cryptoState";
import { useMemo } from "react";

const CATEGORY_COLORS = [
  "var(--t1)", "var(--t2)", "var(--t3)", "var(--t4)", "var(--t5)",
  "var(--brand)", "var(--brand2)", "var(--good)", "var(--bad)", "var(--warn)",
];

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
          <span style={{
            width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            background: s.color,
          }} />
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
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      minHeight: 80,
      transition: "transform 0.15s",
      cursor: "default",
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
  const { state, refresh } = useCrypto();
  const d = cryptoDerived(state);
  const age = d.priceAgeMs < 60000 ? Math.round(d.priceAgeMs / 1000) + "s" : Math.round(d.priceAgeMs / 60000) + "m";

  // Coin allocation slices
  const coinSlices = useMemo((): DonutSlice[] => {
    if (d.pricedMV <= 0) return [];
    const topCoins = d.rows.filter(r => r.mv !== null && r.mv > 0).slice(0, 12);
    const topTotal = topCoins.reduce((s, r) => s + (r.mv || 0), 0);
    const rest = d.pricedMV - topTotal;
    const slices = topCoins.map((r, i) => ({
      label: r.sym,
      value: r.mv || 0,
      pct: ((r.mv || 0) / d.pricedMV) * 100,
      color: COIN_COLORS[i % COIN_COLORS.length],
    }));
    if (rest > 0.01) {
      slices.push({ label: "Other", value: rest, pct: (rest / d.pricedMV) * 100, color: "var(--muted2)" });
    }
    return slices;
  }, [d]);

  // Category allocation
  const catSlices = useMemo((): DonutSlice[] => {
    if (d.pricedMV <= 0) return [];
    const catMap = new Map<string, number>();
    for (const r of d.rows) {
      if (r.mv === null || r.mv <= 0) continue;
      // Find category from holdings or default
      const cat = "Portfolio"; // simplified - all in one category for local state
      catMap.set(cat, (catMap.get(cat) || 0) + r.mv);
    }
    return [...catMap.entries()].map(([label, value], i) => ({
      label, value,
      pct: (value / d.pricedMV) * 100,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  }, [d]);

  // Heatmap - top positions by P&L
  const heatmapItems = useMemo(() => {
    return d.rows
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
          value: fmtFiat(r.mv || 0, d.base).split(" ")[0],
          pct: (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%",
          color: bg,
          mv: r.mv || 0,
        };
      })
      .sort((a, b) => b.mv - a.mv)
      .slice(0, 9);
  }, [d]);

  // Top coin for center label
  const topCoin = coinSlices.length > 0 ? coinSlices[0] : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn secondary" onClick={() => refresh(true)} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
        <span className="pill">Prices: {age} ago</span>
        <span className="pill">{d.base}</span>
      </div>

      {/* KPI Cards */}
      <div className="kpis">
        <div className="kpi-card">
          <div className="kpi-head">
            <span className="kpi-badge" style={{ color: "var(--brand)", borderColor: "color-mix(in srgb,var(--brand) 30%,transparent)", background: "var(--brand3)" }}>{d.base}</span>
          </div>
          <div className="kpi-lbl">PORTFOLIO VALUE</div>
          <div className="kpi-val">{fmtFiat(d.pricedMV, d.base)}</div>
          <div className="kpi-sub">{d.rows.length} assets tracked</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <span className={`kpi-badge ${d.unreal >= 0 ? "good" : "bad"}`}>{d.unreal >= 0 ? "▲" : "▼"}</span>
          </div>
          <div className="kpi-lbl">UNREALIZED P&L</div>
          <div className={`kpi-val ${d.unreal >= 0 ? "good" : "bad"}`}>
            {(d.unreal >= 0 ? "+" : "") + fmtFiat(d.unreal, d.base)}
          </div>
          <div className="kpi-sub">
            {d.pricedCost > 0 ? ((d.unreal / d.pricedCost) * 100).toFixed(2) + "%" : "—"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">TOTAL COST</div>
          <div className="kpi-val">{fmtFiat(d.totalCost, d.base)}</div>
          <div className="kpi-sub">{state.lots.length} lots</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-lbl">METHOD</div>
          <div className="kpi-val" style={{ fontSize: 16 }}>{state.method}</div>
          <div className="kpi-sub">{d.unpriced.length > 0 ? `⚠ ${d.unpriced.length} unpriced` : "All priced ✓"}</div>
        </div>
      </div>

      {/* Coin Allocation + Category Allocation */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div className="panel">
          <div className="panel-head"><h2>Coin Allocation</h2></div>
          <div className="panel-body" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            {coinSlices.length > 0 ? (
              <>
                <DonutChart
                  slices={coinSlices}
                  centerLabel={topCoin?.label || "—"}
                  centerValue={fmtFiat(topCoin?.value || 0, d.base).split(" ")[0]}
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
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(3, 1fr)`,
                gap: 6,
              }}>
                {heatmapItems.map((item, i) => (
                  <HeatmapBlock
                    key={i}
                    sym={item.sym}
                    value={"$" + item.value}
                    pct={item.pct}
                    color={item.color}
                  />
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
        <div className="panel-head"><h2>Top Positions</h2><span className="pill">{d.rows.length} assets</span></div>
        <div className="panel-body">
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>Asset</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>MV</th><th>Unreal P&L</th></tr>
              </thead>
              <tbody>
                {d.rows.length ? d.rows.map(r => {
                  const avg = r.qty > 0 ? r.cost / r.qty : 0;
                  return (
                    <tr key={r.sym}>
                      <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                      <td className="mono">{fmtQty(r.qty)}</td>
                      <td className="mono">{fmtPx(avg)} {d.base}</td>
                      <td className="mono">{r.price === null ? "—" : fmtPx(r.price) + " " + d.base}</td>
                      <td className="mono">{r.mv === null ? "—" : fmtFiat(r.mv, d.base)}</td>
                      <td className={`mono ${r.unreal === null ? "" : r.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                        {r.unreal === null ? "—" : (r.unreal >= 0 ? "+" : "") + fmtFiat(r.unreal, d.base)}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={6} className="muted">No positions yet. Add transactions in the Ledger.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
