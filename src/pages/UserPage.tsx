import { useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { uid, fmtFiat, fmtQty, fmtPx, calcDCA, cryptoPriceOf } from "@/lib/cryptoState";

export default function UserPage() {
  const { state, setState, toast } = useCrypto();
  const [asset, setAsset] = useState("BTC");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [exchange, setExchange] = useState("");
  const [note, setNote] = useState("");

  const addHolding = () => {
    const q = parseFloat(qty), p = parseFloat(price);
    if (!asset.trim() || !(q > 0) || !(p > 0)) { toast("Fill asset, qty, price", "bad"); return; }
    setState(prev => ({
      ...prev,
      holdings: [...prev.holdings, { id: uid(), asset: asset.toUpperCase().trim(), buyPrice: p, quantity: q, date: Date.now(), exchange, note }]
    }));
    setQty(""); setPrice(""); setNote("");
    toast("Holding added ✓", "good");
  };

  const deleteHolding = (id: string) => {
    setState(prev => ({ ...prev, holdings: prev.holdings.filter(h => h.id !== id) }));
    toast("Holding deleted", "warn");
  };

  // Group by asset for DCA summary
  const assets = [...new Set(state.holdings.map(h => h.asset.toUpperCase()))];
  const summaries = assets.map(a => {
    const dca = calcDCA(state.holdings, a);
    const price = cryptoPriceOf(state, a);
    const mv = price !== null ? price * dca.totalQty : null;
    const pnl = mv !== null ? mv - dca.totalCost : null;
    return { asset: a, ...dca, currentPrice: price, mv, pnl };
  });

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 10, alignItems: "start" }}>
        <div>
          <div className="panel">
            <div className="panel-head"><h2>DCA Summary</h2><span className="pill">{assets.length} assets</span></div>
            <div className="panel-body">
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Asset</th><th>Total Qty</th><th>Avg Buy (DCA)</th><th>Current Price</th><th>Total Cost</th><th>Market Value</th><th>P&L</th></tr></thead>
                  <tbody>
                    {summaries.length ? summaries.map(s => (
                      <tr key={s.asset}>
                        <td className="mono" style={{ fontWeight: 900 }}>{s.asset}</td>
                        <td className="mono">{fmtQty(s.totalQty)}</td>
                        <td className="mono">{fmtPx(s.avgPrice)}</td>
                        <td className="mono">{s.currentPrice !== null ? fmtPx(s.currentPrice) : "—"}</td>
                        <td className="mono">{fmtFiat(s.totalCost, state.base)}</td>
                        <td className="mono">{s.mv !== null ? fmtFiat(s.mv, state.base) : "—"}</td>
                        <td className={`mono ${s.pnl === null ? "" : s.pnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                          {s.pnl !== null ? (s.pnl >= 0 ? "+" : "") + fmtFiat(s.pnl, state.base) : "—"}
                        </td>
                      </tr>
                    )) : <tr><td colSpan={7} className="muted">No holdings yet. Add your first buy →</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 10 }}>
            <div className="panel-head"><h2>All Entries</h2><span className="pill">{state.holdings.length}</span></div>
            <div className="panel-body">
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Date</th><th>Asset</th><th>Qty</th><th>Buy Price</th><th>Total</th><th>Exchange</th><th>Action</th></tr></thead>
                  <tbody>
                    {state.holdings.slice().sort((a, b) => b.date - a.date).map(h => (
                      <tr key={h.id}>
                        <td className="mono">{new Date(h.date).toLocaleDateString()}</td>
                        <td className="mono" style={{ fontWeight: 900 }}>{h.asset}</td>
                        <td className="mono">{fmtQty(h.quantity)}</td>
                        <td className="mono">{fmtPx(h.buyPrice)}</td>
                        <td className="mono">{fmtFiat(h.quantity * h.buyPrice, state.base)}</td>
                        <td className="mono muted">{h.exchange || "—"}</td>
                        <td><button className="rowBtn" onClick={() => deleteHolding(h.id)} style={{ color: "var(--bad)" }}>Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Log Buy</h2></div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="form-field"><label className="form-label">Asset</label><input className="inp" value={asset} onChange={e => setAsset(e.target.value)} placeholder="BTC" /></div>
            <div className="form-field"><label className="form-label">Quantity</label><input className="inp" type="number" step="0.00000001" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.0" /></div>
            <div className="form-field"><label className="form-label">Buy Price ({state.base})</label><input className="inp" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
            <div className="form-field"><label className="form-label">Exchange</label><input className="inp" value={exchange} onChange={e => setExchange(e.target.value)} placeholder="Binance, Kraken..." /></div>
            <div className="form-field"><label className="form-label">Note</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="DCA, dip buy..." /></div>
            {qty && price && <div className="cardLite" style={{ fontSize: 11 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Preview</div>
              <div>Total: <strong>{fmtFiat(parseFloat(qty || "0") * parseFloat(price || "0"), state.base)}</strong></div>
            </div>}
            <button className="btn" onClick={addHolding}>+ Add Holding</button>
          </div>
        </div>
      </div>
    </>
  );
}
