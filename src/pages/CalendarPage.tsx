import { useState, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";
import { derivePortfolio, deriveRealizedByTx } from "@/lib/derivePortfolio";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { resolveAssetSymbol } from "@/lib/assetResolver";

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
  const priceGetter = usePortfolioPriceGetter();

  const daysInM = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const allCoins = useMemo(() => {
    const coins = new Set<string>();
    state.txs.forEach((tx) => {
      const sym = resolveAssetSymbol(tx.asset);
      if (sym) coins.add(sym);
    });
    return [...coins].sort();
  }, [state.txs]);

  const toggleCoin = (coin: string) => {
    setSelectedCoins((prev) =>
      prev.includes(coin) ? prev.filter((c) => c !== coin) : [...prev, coin],
    );
  };

  const dailyData = useMemo(() => {
    const data: Record<number, {
      pnl: number;
      value: number;
      trades: number;
      details: { asset: string; qty: number; pnl: number; type: string }[];
    }> = {};

    const monthStart = new Date(year, month, 1).getTime();
    const monthEnd = new Date(year, month + 1, 1).getTime();
    const selected = new Set(selectedCoins.map((c) => c.toUpperCase()));

    const relevantTxs = state.txs
      .map((tx) => ({ ...tx, asset: resolveAssetSymbol(tx.asset) }))
      .filter((tx) => tx.ts < monthEnd)
      .filter((tx) => selected.size === 0 || selected.has(tx.asset.toUpperCase()))
      .sort((a, b) => a.ts - b.ts);

    const realizedByTx = deriveRealizedByTx(relevantTxs);

    for (const tx of relevantTxs) {
      if (tx.ts < monthStart) continue;

      const d = new Date(tx.ts).getDate();
      if (!data[d]) {
        data[d] = { pnl: 0, value: 0, trades: 0, details: [] };
      }

      let pnl = 0;
      if (tx.type === "sell") {
        pnl = realizedByTx.get(tx.id) ?? 0;
      } else if (tx.type === "buy") {
        const currentPrice = priceGetter(tx.asset);
        pnl = currentPrice !== null ? (currentPrice - tx.price) * Math.abs(tx.qty) : 0;
      } else if (tx.type === "fee") {
        pnl = -Math.abs(tx.fee || tx.qty * tx.price || 0);
      }

      data[d].pnl += pnl;
      data[d].trades += 1;
      data[d].details.push({
        asset: tx.asset,
        qty: Math.abs(tx.qty),
        pnl,
        type: tx.type,
      });
    }

    for (let d = 1; d <= daysInM; d++) {
      if (!data[d]) continue;
      const dayEnd = new Date(year, month, d + 1).getTime();
      const txsUntilEnd = relevantTxs.filter((tx) => tx.ts < dayEnd);
      if (txsUntilEnd.length === 0) continue;
      data[d].value = derivePortfolio(txsUntilEnd, priceGetter).totalMV;
    }

    return data;
  }, [state.txs, year, month, daysInM, selectedCoins, priceGetter]);

  const totalP = Object.values(dailyData).reduce((s, d) => s + d.pnl, 0);
  const tradeDays = Object.keys(dailyData).length;
  const totalTrades = Object.values(dailyData).reduce((s, d) => s + d.trades, 0);
  const selData = selectedDay ? dailyData[selectedDay] : null;

  const prev = () => {
    let m = month - 1;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    }
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
  };

  const next = () => {
    let m = month + 1;
    let y = year;
    if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
  };

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
                      <td className="mono">{fmtQty(d.qty)}</td>
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
