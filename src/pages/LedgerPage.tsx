import { useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { uid, cnum, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";

export default function LedgerPage() {
  const { state, setState, toast } = useCrypto();
  const [show, setShow] = useState(false);
  const [type, setType] = useState("buy");
  const [asset, setAsset] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");

  const save = () => {
    const a = asset.trim().toUpperCase(), q = parseFloat(qty), p = parseFloat(price), f = parseFloat(fee) || 0;
    if (!a || !(q > 0)) { toast("Asset and qty required", "bad"); return; }
    const total = (type === "buy" || type === "sell") ? q * p : 0;
    const tx = { id: uid(), ts: Date.now(), type, asset: a, qty: q, price: p, total, fee: f, feeAsset: state.base, accountId: "acc_main", note, lots: "" };
    setState(prev => {
      const newState = { ...prev, txs: [tx, ...prev.txs] };
      if (type === "buy" || type === "reward" || type === "transfer_in") {
        const unitCost = type === "buy" && q > 0 ? (total + f) / q : 0;
        newState.lots = [...prev.lots, { id: "lot_" + uid().slice(0, 10), ts: tx.ts, asset: a, qty: q, qtyRem: q, unitCost, cost: unitCost * q, accountId: "acc_main", tag: type, note }];
      } else if (type === "sell") {
        const lots = [...prev.lots].filter(l => l.asset.toUpperCase() === a && cnum(l.qtyRem, 0) > 0).sort((a, b) => a.ts - b.ts);
        let rem = q, cost = 0;
        for (const l of lots) { if (rem <= 0) break; const take = Math.min(l.qtyRem, rem); l.qtyRem -= take; rem -= take; cost += take * l.unitCost; }
        (tx as any).realized = q * p - f - cost; (tx as any).cost = cost;
        newState.lots = prev.lots.map(pl => lots.find(l => l.id === pl.id) || pl);
      }
      // Also add to holdings for User page
      if (type === "buy") {
        newState.holdings = [...prev.holdings, { id: uid(), asset: a, buyPrice: p, quantity: q, date: Date.now(), exchange: "", note }];
      }
      return newState;
    });
    setShow(false); setAsset(""); setQty(""); setPrice(""); setFee("0"); setNote("");
    toast("Transaction saved ✓", "good");
  };

  const txs = state.txs.slice().sort((a, b) => b.ts - a.ts).slice(0, 200);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => { setType("buy"); setShow(true); }}>+ Buy</button>
        <button className="btn secondary" onClick={() => { setType("sell"); setShow(true); }}>Sell</button>
        <button className="btn secondary" onClick={() => { setType("transfer_in"); setShow(true); }}>Transfer In</button>
      </div>
      {show && (
        <div className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-head"><h2>New {type.replace("_", " ")}</h2></div>
          <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="form-field"><label className="form-label">Asset</label><input className="inp" value={asset} onChange={e => setAsset(e.target.value)} placeholder="BTC" /></div>
            <div className="form-field"><label className="form-label">Quantity</label><input className="inp" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">Price ({state.base})</label><input className="inp" type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">Fee</label><input className="inp" type="number" value={fee} onChange={e => setFee(e.target.value)} /></div>
            <div className="form-field" style={{ gridColumn: "1/-1" }}><label className="form-label">Note</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} /></div>
            <div style={{ gridColumn: "1/-1", display: "flex", gap: 8 }}>
              <button className="btn secondary" onClick={() => setShow(false)}>Cancel</button>
              <button className="btn" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
      <div className="panel">
        <div className="panel-head"><h2>Journal</h2><span className="pill">{txs.length} shown</span></div>
        <div className="panel-body">
          <div className="tableWrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Qty</th><th>Price</th><th>Total</th><th>Fee</th><th>Realized</th><th>Note</th></tr></thead>
            <tbody>
              {txs.length ? txs.map(t => (
                <tr key={t.id}>
                  <td className="mono">{new Date(t.ts).toLocaleString()}</td>
                  <td className={`mono ${t.type === "sell" ? "bad" : t.type === "buy" ? "good" : ""}`} style={{ fontWeight: 900 }}>{t.type}</td>
                  <td className="mono" style={{ fontWeight: 900 }}>{t.asset}</td>
                  <td className="mono">{fmtQty(t.qty)}</td>
                  <td className="mono">{t.type === "buy" || t.type === "sell" ? fmtPx(t.price) + " " + state.base : "—"}</td>
                  <td className="mono">{t.type === "buy" || t.type === "sell" ? fmtFiat(t.total, state.base) : "—"}</td>
                  <td className="mono">{fmtFiat(t.fee, state.base)}</td>
                  <td className={`mono ${(t as any).realized != null ? ((t as any).realized >= 0 ? "good" : "bad") : ""}`}>
                    {(t as any).realized != null ? fmtFiat((t as any).realized, state.base) : "—"}
                  </td>
                  <td className="mono muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</td>
                </tr>
              )) : <tr><td colSpan={9} className="muted">No transactions yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
