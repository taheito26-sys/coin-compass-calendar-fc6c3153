/**
 * Historical Net Value Chart — shows portfolio value over time
 * Derived from transaction history + current prices
 */
import { useMemo, useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtTotal } from "@/lib/cryptoState";
import { normalizeSymbol } from "@/lib/symbolAliases";

const PERIODS = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "max", label: "Max", days: 9999 },
];

export default function HistoricalNetValue() {
  const { state } = useCrypto();
  const { getPrice } = useLivePrices();
  const [period, setPeriod] = useState("90d");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (state.txs.length === 0) return [];

    const days = PERIODS.find(p => p.key === period)?.days ?? 90;
    const now = Date.now();
    const sorted = [...state.txs].sort((a, b) => a.ts - b.ts);
    const firstTx = sorted[0]?.ts || now;
    const startMs = days < 9999 ? now - days * 86400_000 : firstTx;

    // Build daily snapshots
    const dayMs = 86400_000;
    const startDay = Math.floor(startMs / dayMs);
    const endDay = Math.floor(now / dayMs);
    const numDays = Math.min(endDay - startDay + 1, 365);

    if (numDays < 2) return [];

    // Compute holdings at each day boundary
    const points: { date: number; value: number }[] = [];

    for (let d = 0; d < numDays; d++) {
      const dayTs = (startDay + d) * dayMs + dayMs;
      // Accumulate holdings up to this day
      const holdings = new Map<string, number>();
      for (const tx of sorted) {
        if (tx.ts > dayTs) break;
        const sym = normalizeSymbol(tx.asset);
        if (!sym) continue;
        const cur = holdings.get(sym) || 0;
        const mult = (tx.type === "sell" || tx.type === "withdrawal" || tx.type === "transfer_out") ? -1 : 1;
        holdings.set(sym, cur + tx.qty * mult);
      }
      // Value at current prices (approximation)
      let value = 0;
      for (const [sym, qty] of holdings) {
        if (qty <= 0) continue;
        const live = getPrice(sym);
        const price = live?.current_price ?? 0;
        value += qty * price;
      }
      points.push({ date: dayTs, value });
    }

    return points;
  }, [state.txs, getPrice, period]);

  if (chartData.length < 2) return null;

  const w = 500, h = 140;
  const values = chartData.map(p => p.value);
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05;
  const range = max - min || 1;

  const points = chartData.map((p, i) =>
    `${(i / (chartData.length - 1)) * w},${h - ((p.value - min) / range) * (h - 16) - 8}`
  ).join(" ");

  // Area fill
  const areaPath = `M 0,${h} ` + chartData.map((p, i) =>
    `L ${(i / (chartData.length - 1)) * w},${h - ((p.value - min) / range) * (h - 16) - 8}`
  ).join(" ") + ` L ${w},${h} Z`;

  const hovered = hoveredIdx !== null ? chartData[hoveredIdx] : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Portfolio Value</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                fontSize: 9, padding: "2px 8px", cursor: "pointer", border: "none",
                borderRadius: 4, fontWeight: 700,
                background: period === p.key ? "var(--brand)" : "var(--panel2)",
                color: period === p.key ? "#fff" : "var(--muted)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ padding: "8px 12px" }}>
        {hovered && (
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
            {new Date(hovered.date).toLocaleDateString()} —{" "}
            <span className="zen-hide" style={{ fontWeight: 700, color: "var(--text)" }}>{fmtTotal(hovered.value)}</span>
          </div>
        )}
        <svg
          width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}
          onMouseLeave={() => setHoveredIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const idx = Math.round(x * (chartData.length - 1));
            setHoveredIdx(Math.max(0, Math.min(chartData.length - 1, idx)));
          }}
        >
          <defs>
            <linearGradient id="nvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#nvGrad)" />
          <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
          {hoveredIdx !== null && (
            <>
              <line
                x1={(hoveredIdx / (chartData.length - 1)) * w}
                y1={0} x2={(hoveredIdx / (chartData.length - 1)) * w}
                y2={h} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3"
              />
              <circle
                cx={(hoveredIdx / (chartData.length - 1)) * w}
                cy={h - ((chartData[hoveredIdx].value - min) / range) * (h - 16) - 8}
                r={4} fill="var(--brand)"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
