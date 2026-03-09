/**
 * Value Distribution by Exchange/Venue — pie chart
 */
import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtTotal } from "@/lib/cryptoState";
import { normalizeSymbol } from "@/lib/symbolAliases";

const VENUE_COLORS = [
  "#f97316", "#3b82f6", "#8b5cf6", "#ef4444", "#22c55e",
  "#06b6d4", "#ec4899", "#eab308", "#14b8a6", "#6366f1",
];

interface VenueSlice {
  venue: string;
  value: number;
  pct: number;
  color: string;
}

export default function ValueDistribution() {
  const { state } = useCrypto();
  const { getPrice } = useLivePrices();

  const slices = useMemo((): VenueSlice[] => {
    const venueMap = new Map<string, number>();

    for (const tx of state.txs) {
      if (tx.type !== "buy" && tx.type !== "reward" && tx.type !== "deposit") continue;
      const sym = normalizeSymbol(tx.asset);
      if (!sym) continue;
      const venue = tx.note?.match(/venue:(\S+)/)?.[1] || "Unknown";
      const live = getPrice(sym);
      const price = live?.current_price ?? tx.price ?? 0;
      const val = tx.qty * price;
      venueMap.set(venue, (venueMap.get(venue) || 0) + val);
    }

    // If no venue data from notes, group by source from CSV imports
    if (venueMap.size <= 1) {
      venueMap.clear();
      // Group by asset exchange source
      const sourceMap = new Map<string, number>();
      for (const tx of state.txs) {
        const sym = normalizeSymbol(tx.asset);
        if (!sym) continue;
        const source = tx.accountId || "Manual";
        const live = getPrice(sym);
        const price = live?.current_price ?? 0;
        const mult = (tx.type === "sell" || tx.type === "withdrawal") ? -1 : 1;
        sourceMap.set(source, (sourceMap.get(source) || 0) + tx.qty * price * mult);
      }
      for (const [k, v] of sourceMap) {
        if (v > 0) venueMap.set(k, v);
      }
    }

    const total = [...venueMap.values()].reduce((s, v) => s + v, 0);
    if (total <= 0) return [];

    return [...venueMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([venue, value], i) => ({
        venue,
        value,
        pct: (value / total) * 100,
        color: VENUE_COLORS[i % VENUE_COLORS.length],
      }));
  }, [state.txs, getPrice]);

  if (slices.length === 0) return null;

  const total = slices.reduce((s, sl) => s + sl.value, 0);

  return (
    <div className="panel">
      <div className="panel-head"><h2>Value by Source</h2></div>
      <div className="panel-body" style={{ padding: 12 }}>
        {/* Horizontal bar chart */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {slices.map((s, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ fontWeight: 700 }}>{s.venue}</span>
                <span className="zen-hide" style={{ color: "var(--muted)" }}>{fmtTotal(s.value)} ({s.pct.toFixed(1)}%)</span>
                <span className="zen-show" style={{ color: "var(--muted)", display: "none" }}>{s.pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${s.pct}%`, background: s.color, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="zen-hide" style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, textAlign: "right" }}>
          Total: {fmtTotal(total)}
        </div>
      </div>
    </div>
  );
}
