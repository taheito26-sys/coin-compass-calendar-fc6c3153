import { useState, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, cryptoPriceOf } from "@/lib/cryptoState";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function CalendarPage() {
  const { state } = useCrypto();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedCoins, setSelectedCoins] = useState<string[]>([]);
  const [showCoinFilter, setShowCoinFilter] = useState(false);

  const daysInM = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  // Get unique coins from transactions
  const allCoins = useMemo(() => {
    const coins = new Set<string>();
    state.txs.forEach(tx => coins.add(tx.asset.toUpperCase()));
    state.holdings.forEach(h => coins.add(h.asset.toUpperCase()));
    return [...coins].sort();
  }, [state.txs, state.holdings]);

  const toggleCoin = (coin: string) => {
    setSelectedCoins(prev =>
      prev.includes(coin) ? prev.filter(c => c !== coin) : [...prev, coin]
    );
  };

  // Build daily data from holdings + txs, with optional coin filter
  const dailyData = useMemo(() => {
    const data: Record<number, {
      pnl: number;
      value: number;
      trades: number;
      details: { asset: string; qty: number; pnl: number; type: string }[];
    }> = {};

    for (let d = 1; d <= daysInM; d++) {
      const dayStart = new Date(year, month, d).getTime();
      const dayEnd = new Date(year, month, d + 1).getTime();

      // Holdings bought on this day
      const dayHoldings = state.holdings.filter(h => {
        if (h.date >= dayStart && h.date < dayEnd) {
          if (selectedCoins.length > 0) return selectedCoins.includes(h.asset.toUpperCase());
          return true;
        }
        return false;
      });

      let totalPnl = 0;
      const details: { asset: string; qty: number; pnl: number; type: string }[] = [];

      for (const h of dayHoldings) {
        const currentPrice = cryptoPriceOf(state, h.asset);
        const pnl = currentPrice !== null ? (currentPrice - h.buyPrice) * h.quantity : 0;
        totalPnl += pnl;
        details.push({ asset: h.asset, qty: h.quantity, pnl, type: "holding" });
      }

      // Transactions on this day
      const dayTxs = state.txs.filter(tx => {
        const ts = new Date(tx.ts);
        if (ts.getTime() >= dayStart && ts.getTime() < dayEnd) {
          if (selectedCoins.length > 0) return selectedCoins.includes(tx.asset.toUpperCase());
          return true;
        }
        return false;
      });

      for (const tx of dayTxs) {
        if (tx.type === "sell" && typeof tx.realized === "number") {
          totalPnl += tx.realized;
          details.push({ asset: tx.asset, qty: tx.qty, pnl: tx.realized, type: "sell" });
        } else if (tx.type === "buy") {
          const currentPrice = cryptoPriceOf(state, tx.asset);
          const pnl = currentPrice !== null ? (currentPrice - tx.price) * tx.qty : 0;
          // Don't double count if already in holdings
          if (!dayHoldings.some(h => h.asset.toUpperCase() === tx.asset.toUpperCase() && Math.abs(h.quantity - tx.qty) < 0.0001)) {
            totalPnl += pnl;
            details.push({ asset: tx.asset, qty: tx.qty, pnl, type: "buy" });
          }
        }
      }

      const totalEntries = details.length;
      if (totalEntries > 0) {
        // Calculate rough portfolio value for the day
        let dayValue = 0;
        for (const h of state.holdings) {
          if (h.date <= dayEnd) {
            if (selectedCoins.length > 0 && !selectedCoins.includes(h.asset.toUpperCase())) continue;
            const px = cryptoPriceOf(state, h.asset);
            if (px !== null) dayValue += px * h.quantity;
          }
        }
        data[d] = { pnl: totalPnl, value: dayValue, trades: totalEntries, details };
      }
    }
    return data;
  }, [state, year, month, daysInM, selectedCoins]);

  const totalP = Object.values(dailyData).reduce((s, d) => s + d.pnl, 0);
  const tradeDays = Object.keys(dailyData).length;
  const totalTrades = Object.values(dailyData).reduce((s, d) => s + d.trades, 0);
  const selData = selectedDay ? dailyData[selectedDay] : null;

  const prev = () => { let m = month - 1, y = year; if (m < 0) { m = 11; y--; } setMonth(m); setYear(y); setSelectedDay(null); };
  const next = () => { let m = month + 1, y = year; if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); setSelectedDay(null); };

  return (
    <>
      {/* Coin filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={`btn ${showCoinFilter ? "" : "secondary"}`} onClick={() => setShowCoinFilter(!showCoinFilter)}>
          🪙 {selectedCoins.length > 0 ? `${selectedCoins.length} coins` : "All Coins"}
        </button>
        {selectedCoins.length > 0 && (
          <button className="btn secondary" onClick={() => setSelectedCoins([])}>Clear Filter</button>
        )}
        {selectedCoins.map(c => (
          <span key={c} className="pill good" style={{ cursor: "pointer" }} onClick={() => toggleCoin(c)}>
            {c} ✕
          </span>
        ))}
      </div>

      {showCoinFilter && (
        <div className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-body">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allCoins.map(coin => (
                <button
                  key={coin}
                  className={`btn tiny ${selectedCoins.includes(coin) ? "" : "secondary"}`}
                  onClick={() => toggleCoin(coin)}
                >
                  {coin}
                </button>
              ))}
              {allCoins.length === 0 && <span className="muted">No coins found. Add transactions first.</span>}
            </div>
          </div>
        </div>
      )}

      {/* Monthly stats */}
      <div className="cal-stats">
        <div className="cal-stat">
          <div className="kpi-lbl">Monthly P&L</div>
          <div className={`kpi-val ${totalP >= 0 ? "good" : "bad"}`}>
            {(totalP >= 0 ? "+" : "") + fmtFiat(totalP, state.base)}
          </div>
        </div>
        <div className="cal-stat">
          <div className="kpi-lbl">Active Days</div>
          <div className="kpi-val">{tradeDays}</div>
        </div>
        <div className="cal-stat">
          <div className="kpi-lbl">Total Entries</div>
          <div className="kpi-val">{totalTrades}</div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="panel">
        <div className="panel-head">
          <h2>{MONTHS[month]} {year}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn secondary" onClick={prev}>← Prev</button>
            <button className="btn secondary" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(null); }}>Today</button>
            <button className="btn secondary" onClick={next}>Next →</button>
          </div>
        </div>
        <div className="panel-body">
          <div className="cal-grid">
            {DAYS.map(d => <div key={d} className="cal-hdr">{d}</div>)}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} className="cal-day empty" />)}
            {Array.from({ length: daysInM }, (_, i) => {
              const d = i + 1;
              const data = dailyData[d];
              const isToday = d === now.getDate() && year === now.getFullYear() && month === now.getMonth();
              const isSel = d === selectedDay;
              const cls = [
                "cal-day",
                data && data.pnl > 0 ? "has-profit" : data && data.pnl < 0 ? "has-loss" : "",
                isToday ? "today" : "",
                isSel ? "selected" : "",
              ].filter(Boolean).join(" ");
              return (
                <div key={d} className={cls} onClick={() => setSelectedDay(selectedDay === d ? null : d)}>
                  <div className="cal-num">{d}</div>
                  {data && (
                    <>
                      <div className={`cal-profit ${data.pnl >= 0 ? "good" : "bad"}`}>
                        {(data.pnl >= 0 ? "+" : "") + fmtFiat(data.pnl, state.base).split(" ")[0]}
                      </div>
                      <div className="cal-count">{data.trades}t</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day drilldown */}
      {selectedDay && selData && (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="panel-head">
            <h2>📅 {MONTHS[month]} {selectedDay} — {selData.trades} entries</h2>
            {selData.value > 0 && (
              <span className="pill">Portfolio: {fmtFiat(selData.value, state.base)}</span>
            )}
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div className="cal-stat">
                <div className="kpi-lbl">Daily P&L</div>
                <div className={`kpi-val ${selData.pnl >= 0 ? "good" : "bad"}`}>
                  {(selData.pnl >= 0 ? "+" : "") + fmtFiat(selData.pnl, state.base)}
                </div>
              </div>
              <div className="cal-stat">
                <div className="kpi-lbl">Entries</div>
                <div className="kpi-val">{selData.trades}</div>
              </div>
            </div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Asset</th><th>Type</th><th>Qty</th><th>P&L</th></tr></thead>
                <tbody>
                  {selData.details.map((d, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontWeight: 900 }}>{d.asset}</td>
                      <td className={`mono ${d.type === "sell" ? "bad" : d.type === "buy" ? "good" : "muted"}`} style={{ fontWeight: 700 }}>
                        {d.type.toUpperCase()}
                      </td>
                      <td className="mono">{d.qty}</td>
                      <td className={`mono ${d.pnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700 }}>
                        {(d.pnl >= 0 ? "+" : "") + fmtFiat(d.pnl, state.base)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
