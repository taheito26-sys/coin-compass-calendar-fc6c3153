/**
 * Events/Activity Analysis — summary of trading activity
 */
import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtTotal } from "@/lib/cryptoState";
import { normalizeSymbol } from "@/lib/symbolAliases";

export default function EventsAnalysis() {
  const { state } = useCrypto();

  const stats = useMemo(() => {
    if (state.txs.length === 0) return null;

    let totalFees = 0;
    const sourceCounts = new Map<string, number>();
    const assetCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();
    let buys = 0, sells = 0, transfers = 0;

    for (const tx of state.txs) {
      totalFees += tx.fee || 0;

      const source = tx.accountId || "Manual";
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);

      const sym = normalizeSymbol(tx.asset);
      if (sym) assetCounts.set(sym, (assetCounts.get(sym) || 0) + 1);

      const month = new Date(tx.ts).toLocaleDateString(undefined, { year: "numeric", month: "short" });
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);

      if (tx.type === "buy") buys++;
      else if (tx.type === "sell") sells++;
      else transfers++;
    }

    const topSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topAssets = [...assetCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const busiestMonths = [...monthCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    return { totalFees, buys, sells, transfers, topSources, topAssets, busiestMonths, total: state.txs.length };
  }, [state.txs]);

  if (!stats) return null;

  return (
    <div className="panel">
      <div className="panel-head"><h2>Activity Analysis</h2></div>
      <div className="panel-body" style={{ padding: 12 }}>
        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)" }}>{stats.total}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>Total Txs</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--good)" }}>{stats.buys}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>Buys</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--bad)" }}>{stats.sells}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>Sells</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="zen-hide" style={{ fontSize: 16, fontWeight: 900, color: "var(--warn)" }}>{fmtTotal(stats.totalFees)}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>Fees Paid</div>
          </div>
        </div>

        {/* Top assets + sources */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Most Traded</div>
            {stats.topAssets.map(([sym, count]) => (
              <div key={sym} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                <span style={{ fontWeight: 700 }}>{sym}</span>
                <span style={{ color: "var(--muted)" }}>{count} txs</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Busiest Months</div>
            {stats.busiestMonths.map(([month, count]) => (
              <div key={month} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                <span style={{ fontWeight: 700 }}>{month}</span>
                <span style={{ color: "var(--muted)" }}>{count} txs</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
