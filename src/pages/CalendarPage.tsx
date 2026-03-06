import { useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtPx, cryptoPriceOf } from "@/lib/cryptoState";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function CalendarPage() {
  const { state } = useCrypto();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const daysInM = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  // Build daily data from holdings + current prices
  const dailyData: Record<number, { pnl: number; holdings: number; details: { asset: string; qty: number; pnl: number }[] }> = {};

  for (let d = 1; d <= daysInM; d++) {
    const dayStart = new Date(year, month, d).getTime();
    const dayEnd = new Date(year, month, d + 1).getTime();
    const dayHoldings = state.holdings.filter(h => h.date >= dayStart && h.date < dayEnd);
    let totalPnl = 0;
    const details: { asset: string; qty: number; pnl: number }[] = [];
    for (const h of dayHoldings) {
      const currentPrice = cryptoPriceOf(state, h.asset);
      const pnl = currentPrice !== null ? (currentPrice - h.buyPrice) * h.quantity : 0;
      totalPnl += pnl;
      details.push({ asset: h.asset, qty: h.quantity, pnl });
    }
    if (dayHoldings.length > 0) {
      dailyData[d] = { pnl: totalPnl, holdings: dayHoldings.length, details };
    }
  }

  // Also compute from txs (sells have realized P&L)
  for (const tx of state.txs) {
    if (tx.type !== "sell" || typeof tx.realized !== "number") continue;
    const dt = new Date(tx.ts);
    if (dt.getFullYear() !== year || dt.getMonth() !== month) continue;
    const d = dt.getDate();
    if (!dailyData[d]) dailyData[d] = { pnl: 0, holdings: 0, details: [] };
    dailyData[d].pnl += tx.realized;
    dailyData[d].holdings++;
    dailyData[d].details.push({ asset: tx.asset, qty: tx.qty, pnl: tx.realized });
  }

  const totalP = Object.values(dailyData).reduce((s, d) => s + d.pnl, 0);
  const tradeDays = Object.keys(dailyData).length;
  const selData = selectedDay ? dailyData[selectedDay] : null;

  const prev = () => { let m = month - 1, y = year; if (m < 0) { m = 11; y--; } setMonth(m); setYear(y); setSelectedDay(null); };
  const next = () => { let m = month + 1, y = year; if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); setSelectedDay(null); };

  return (
    <>
      <div className="cal-stats">
        <div className="cal-stat"><div className="kpi-lbl">Monthly P&L</div><div className={`kpi-val ${totalP >= 0 ? "good" : "bad"}`}>{(totalP >= 0 ? "+" : "") + fmtFiat(totalP, state.base)}</div></div>
        <div className="cal-stat"><div className="kpi-lbl">Active Days</div><div className="kpi-val">{tradeDays}</div></div>
        <div className="cal-stat"><div className="kpi-lbl">Total Entries</div><div className="kpi-val">{Object.values(dailyData).reduce((s, d) => s + d.holdings, 0)}</div></div>
      </div>

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
                  {data && <>
                    <div className={`cal-profit ${data.pnl >= 0 ? "good" : "bad"}`}>{(data.pnl >= 0 ? "+" : "") + fmtFiat(data.pnl, state.base).split(" ")[0]}</div>
                    <div className="cal-count">{data.holdings}e</div>
                  </>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDay && selData && (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="panel-head"><h2>📅 {MONTHS[month]} {selectedDay} — {selData.holdings} entries</h2></div>
          <div className="panel-body">
            <div className="tableWrap">
              <table>
                <thead><tr><th>Asset</th><th>Qty</th><th>P&L</th></tr></thead>
                <tbody>
                  {selData.details.map((d, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontWeight: 900 }}>{d.asset}</td>
                      <td className="mono">{d.qty}</td>
                      <td className={`mono ${d.pnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700 }}>{(d.pnl >= 0 ? "+" : "") + fmtFiat(d.pnl, state.base)}</td>
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
