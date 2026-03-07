import { useState, useRef, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { uid, cnum, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { importCSV, hashFile } from "@/lib/importers";
import type { ParseResult } from "@/lib/importers";
import CoinAutocomplete from "@/components/CoinAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { createTransaction, updateTransaction, deleteTransaction, createImportedFile, fetchAssets, getSourceLog } from "@/lib/api";

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  gate: "Gate.io",
};

async function findAssetId(symbol: string): Promise<string | null> {
  const sym = symbol.toUpperCase();
  try {
    const assets = await fetchAssets();
    const match = assets.find(a => a.symbol.toUpperCase() === sym);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

async function saveTransactionViaApi(tx: {
  type: string; asset: string; qty: number; price: number;
  fee: number; venue: string; note: string; ts: number;
}): Promise<{ ok: boolean; source: string }> {
  const assetId = await findAssetId(tx.asset);
  if (!assetId) {
    console.warn(`[ledger] Asset ${tx.asset} not found in assets table`);
    return { ok: false, source: "none" };
  }

  try {
    await createTransaction({
      asset_id: assetId,
      timestamp: new Date(tx.ts).toISOString(),
      type: tx.type,
      qty: tx.qty,
      unit_price: tx.price || 0,
      fee_amount: tx.fee || 0,
      fee_currency: "USD",
      venue: tx.venue || undefined,
      note: tx.note || undefined,
      source: "manual",
    });
    const log = getSourceLog(1);
    const source = log.length > 0 ? log[log.length - 1].source : "unknown";
    return { ok: true, source };
  } catch (err: any) {
    console.error("[ledger] Save failed:", err);
    return { ok: false, source: "error" };
  }
}

export default function LedgerPage() {
  const { state, setState, toast } = useCrypto();

  // Manual entry state
  const [type, setType] = useState("buy");
  const [asset, setAsset] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Import state
  const [importStage, setImportStage] = useState<"upload" | "preview" | "done">("upload");
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editAsset, setEditAsset] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editType, setEditType] = useState("");

  const importedFiles = state.importedFiles || [];

  // Manual save — writes to both localStorage AND Supabase
  const save = async () => {
    const a = asset.trim().toUpperCase(), q = parseFloat(qty), p = parseFloat(price), f = parseFloat(fee) || 0;
    if (!a || !(q > 0)) { toast("Asset and qty required", "bad"); return; }
    const total = (type === "buy" || type === "sell") ? q * p : 0;
    const ts = Date.now();
    const tx = { id: uid(), ts, type, asset: a, qty: q, price: p, total, fee: f, feeAsset: state.base, accountId: "acc_main", note, lots: "" };

    // Save to local state
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
      if (type === "buy") {
        newState.holdings = [...prev.holdings, { id: uid(), asset: a, buyPrice: p, quantity: q, date: Date.now(), exchange: venue, note }];
      }
      return newState;
    });

    // Save to backend via API client (Worker-first, Supabase fallback)
    setSaving(true);
    const result = await saveTransactionViaApi({ type, asset: a, qty: q, price: p, fee: f, venue, note, ts });
    setSaving(false);

    setAsset(""); setQty(""); setPrice(""); setFee("0"); setVenue(""); setNote("");
    if (result.ok) {
      toast(`Transaction saved ✓ (via ${result.source})`, "good");
    } else {
      toast("Transaction saved locally only (backend sync failed)", "good");
    }
  };

  // Edit handlers
  const startEdit = (t: any) => {
    setEditId(t.id);
    setEditAsset(t.asset);
    setEditQty(String(t.qty));
    setEditPrice(String(t.price));
    setEditType(t.type);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const newQty = parseFloat(editQty);
    const newPrice = parseFloat(editPrice);

    // Update local state
    setState(prev => ({
      ...prev,
      txs: prev.txs.map(t => t.id === editId ? {
        ...t,
        asset: editAsset.toUpperCase(),
        qty: newQty || t.qty,
        price: newPrice || t.price,
        type: editType,
        total: (editType === "buy" || editType === "sell") ? (newQty || 0) * (newPrice || 0) : t.total,
      } : t),
    }));
    setEditId(null);

    // Persist to backend
    try {
      await updateTransaction(editId, {
        type: editType,
        qty: newQty || undefined,
        unit_price: newPrice || undefined,
      });
      const log = getSourceLog(1);
      const source = log.length > 0 ? log[log.length - 1].source : "unknown";
      toast(`Transaction updated ✓ (via ${source})`, "good");
    } catch (err: any) {
      console.error("[ledger] Update failed:", err);
      toast("Updated locally only (backend sync failed)", "good");
    }
  };

  const deleteTx = async (id: string) => {
    setState(prev => ({ ...prev, txs: prev.txs.filter(t => t.id !== id) }));

    // Persist to backend
    try {
      await deleteTransaction(id);
      const log = getSourceLog(1);
      const source = log.length > 0 ? log[log.length - 1].source : "unknown";
      toast(`Transaction deleted ✓ (via ${source})`, "good");
    } catch (err: any) {
      console.error("[ledger] Delete failed:", err);
      toast("Deleted locally only (backend sync failed)", "good");
    }
  };

  // Import handlers
  const handleFile = useCallback(async (file: File) => {
    setImportError("");
    setImportLoading(true);
    try {
      const text = await file.text();
      const hash = await hashFile(text);
      if (importedFiles.some((f: any) => f.hash === hash)) {
        setImportError("This file has already been imported (duplicate detected).");
        setImportLoading(false);
        return;
      }
      const parsed = await importCSV(text, file.name);
      setFileName(file.name);
      setFileHash(hash);
      setImportResult(parsed);
      if (parsed.rows.length === 0 && parsed.warnings.length > 0) {
        setImportError(parsed.warnings[0]);
      } else {
        setImportStage("preview");
      }
    } catch (e: any) {
      setImportError("Failed to parse: " + (e.message || e));
    }
    setImportLoading(false);
  }, [importedFiles]);

  const commitImport = async () => {
    if (!importResult || importResult.rows.length === 0) return;

    // Save to local state
    setState(prev => {
      const newTxs = [...prev.txs];
      const newLots = [...prev.lots];
      const newHoldings = [...prev.holdings];
      for (const row of importResult.rows) {
        const txId = uid();
        const assetSym = extractBase(row.symbol);
        const tx = {
          id: txId, ts: row.timestamp, type: row.side, asset: assetSym,
          qty: row.qty, price: row.unitPrice, total: row.grossValue,
          fee: row.feeAmount, feeAsset: row.feeAsset || prev.base,
          accountId: "acc_main", note: `Import: ${EXCHANGE_LABELS[row.exchange]} ${row.externalId}`, lots: "",
        };
        newTxs.push(tx);
        if (row.side === "buy") {
          const unitCost = row.qty > 0 ? (row.grossValue + row.feeAmount) / row.qty : 0;
          newLots.push({ id: "lot_" + uid().slice(0, 10), ts: row.timestamp, asset: assetSym, qty: row.qty, qtyRem: row.qty, unitCost, cost: unitCost * row.qty, accountId: "acc_main", tag: "buy", note: `Import: ${EXCHANGE_LABELS[row.exchange]}` });
          newHoldings.push({ id: uid(), asset: assetSym, buyPrice: row.unitPrice, quantity: row.qty, date: row.timestamp, exchange: EXCHANGE_LABELS[row.exchange], note: `Imported from ${fileName}` });
        } else if (row.side === "sell") {
          const lots = newLots.filter(l => l.asset.toUpperCase() === assetSym && (l.qtyRem || 0) > 0).sort((a, b) => a.ts - b.ts);
          let rem = row.qty, cost = 0;
          for (const l of lots) { if (rem <= 0) break; const take = Math.min(l.qtyRem, rem); l.qtyRem -= take; rem -= take; cost += take * l.unitCost; }
          (tx as any).realized = row.grossValue - row.feeAmount - cost; (tx as any).cost = cost;
        }
      }
      return {
        ...prev, txs: newTxs, lots: newLots, holdings: newHoldings,
        importedFiles: [...(prev.importedFiles || []), { name: fileName, hash: fileHash, importedAt: Date.now(), exchange: importResult.exchange, exportType: importResult.exportType, rowCount: importResult.rows.length }],
      };
    });

    // Sync each imported row to backend via API client
    let synced = 0;
    for (const row of importResult.rows) {
      const assetSym = extractBase(row.symbol);
      const result = await saveTransactionViaApi({
        type: row.side, asset: assetSym, qty: row.qty,
        price: row.unitPrice, fee: row.feeAmount,
        venue: EXCHANGE_LABELS[row.exchange] || row.exchange,
        note: `Import: ${row.externalId}`, ts: row.timestamp,
      });
      if (result.ok) synced++;
    }

    // Also record the imported file
    try {
      await createImportedFile({
        file_name: fileName,
        file_hash: fileHash,
        exchange: importResult.exchange,
        export_type: importResult.exportType,
        row_count: importResult.rows.length,
      });
    } catch (err: any) {
      console.warn("[import] Failed to record imported file:", err.message);
    }

    const log = getSourceLog(1);
    const source = log.length > 0 ? log[log.length - 1].source : "unknown";
    toast(`Imported ${importResult.rows.length} trades (${synced} synced via ${source})`, "good");
    setImportStage("done");
  };

  const resetImport = () => {
    setImportStage("upload");
    setImportResult(null);
    setFileName("");
    setFileHash("");
    setImportError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const txs = state.txs.slice().sort((a, b) => b.ts - a.ts).slice(0, 200);

  return (
    <>
      {/* Top row: Manual Entry + CSV Import side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {/* Manual Entry */}
        <div className="panel">
          <div className="panel-head"><h2>+ Manual Entry</h2>{saving && <span className="pill">Syncing…</span>}</div>
          <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="form-field">
              <label className="form-label">Type</label>
              <select className="inp" value={type} onChange={e => setType(e.target.value)}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="transfer_in">Transfer In</option>
                <option value="transfer_out">Transfer Out</option>
                <option value="reward">Reward</option>
              </select>
            </div>
            <div className="form-field"><label className="form-label">Asset</label><CoinAutocomplete value={asset} onChange={setAsset} /></div>
            <div className="form-field"><label className="form-label">Quantity</label><input className="inp" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">Unit Price ({state.base})</label><input className="inp" type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">Venue</label><input className="inp" value={venue} onChange={e => setVenue(e.target.value)} placeholder="Binance, Coinbase..." /></div>
            <div className="form-field"><label className="form-label">Tags</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></div>
            <div style={{ gridColumn: "1/-1", display: "flex", gap: 8 }}>
              <button className="btn" onClick={save} disabled={saving}>Save Transaction</button>
            </div>
          </div>
        </div>

        {/* CSV Import */}
        <div className="panel">
          <div className="panel-head">
            <h2>📥 CSV Import</h2>
            <span className="pill">Spot Trades</span>
          </div>
          <div className="panel-body">
            {importStage === "upload" && (
              <>
                <div className="import-exchanges" style={{ marginBottom: 8 }}>
                  {["binance", "bybit", "okx", "gate"].map(ex => (
                    <span key={ex} className="pill">{EXCHANGE_LABELS[ex]}</span>
                  ))}
                </div>
                <div
                  className="import-drop"
                  style={{ minHeight: 100 }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  {importLoading ? <div className="muted">Parsing…</div> : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" width="28" height="28"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <div style={{ marginTop: 4, fontSize: 12 }}>Drop CSV or click to browse</div>
                    </>
                  )}
                </div>
                {importError && <div className="import-error">{importError}</div>}
              </>
            )}
            {importStage === "preview" && importResult && (
              <>
                <div className="import-summary" style={{ marginBottom: 8 }}>
                  <div className="import-stat"><div className="import-stat-val good">{importResult.rowCount}</div><div className="import-stat-lbl">Parsed</div></div>
                  <div className="import-stat"><div className="import-stat-val" style={{ color: importResult.skippedCount > 0 ? "var(--bad)" : "var(--muted)" }}>{importResult.skippedCount}</div><div className="import-stat-lbl">Skipped</div></div>
                </div>
                {importResult.warnings.length > 0 && (
                  <div className="import-warnings">{importResult.warnings.map((w, i) => <div key={i} className="import-warning">⚠ {w}</div>)}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn secondary" onClick={resetImport}>Cancel</button>
                  <button className="btn" onClick={commitImport}>Commit {importResult.rowCount} Trades</button>
                </div>
              </>
            )}
            {importStage === "done" && importResult && (
              <>
                <p><strong>{importResult.rowCount}</strong> trades from <strong>{EXCHANGE_LABELS[importResult.exchange]}</strong> committed ✓</p>
                <button className="btn" onClick={resetImport} style={{ marginTop: 8 }}>Import Another</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Transaction Ledger */}
      <div className="panel">
        <div className="panel-head"><h2>Transaction Ledger</h2><span className="pill">{txs.length} entries</span></div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>TYPE</th>
                  <th>ASSET</th>
                  <th>QTY</th>
                  <th>UNIT PRICE</th>
                  <th>FEE</th>
                  <th>VENUE</th>
                  <th>TAGS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {txs.length ? txs.map(t => (
                  <tr key={t.id}>
                    {editId === t.id ? (
                      <>
                        <td className="mono">{new Date(t.ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td>
                          <select className="inp" value={editType} onChange={e => setEditType(e.target.value)} style={{ width: 80, padding: "2px 4px", fontSize: 11 }}>
                            <option value="buy">BUY</option>
                            <option value="sell">SELL</option>
                          </select>
                        </td>
                        <td><input className="inp" value={editAsset} onChange={e => setEditAsset(e.target.value)} style={{ width: 60, padding: "2px 4px", fontSize: 11 }} /></td>
                        <td><input className="inp" type="number" value={editQty} onChange={e => setEditQty(e.target.value)} style={{ width: 90, padding: "2px 4px", fontSize: 11 }} /></td>
                        <td><input className="inp" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} style={{ width: 80, padding: "2px 4px", fontSize: 11 }} /></td>
                        <td className="mono muted">—</td>
                        <td className="mono muted">—</td>
                        <td className="mono muted">—</td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={saveEdit} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--good)", fontSize: 12 }}>✓</button>
                            <button onClick={() => setEditId(null)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono">{new Date(t.ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className={`mono ${t.type === "sell" ? "bad" : t.type === "buy" ? "good" : ""}`} style={{ fontWeight: 900 }}>{t.type.toUpperCase()}</td>
                        <td className="mono" style={{ fontWeight: 900 }}>{t.asset}</td>
                        <td className="mono">{fmtQty(t.qty)}</td>
                        <td className="mono">{t.type === "buy" || t.type === "sell" ? "$" + fmtPx(t.price) : "—"}</td>
                        <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee, state.base) : "—"}</td>
                        <td className="mono muted">{(t as any).venue || "—"}</td>
                        <td className="mono muted" style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => startEdit(t)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--text)", fontSize: 13 }}>✎</button>
                            <button onClick={() => deleteTx(t.id)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--bad)", fontSize: 13 }}>🗑</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )) : <tr><td colSpan={9} className="muted">No transactions yet. Use Manual Entry or CSV Import above.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function extractBase(symbol: string): string {
  const clean = symbol.replace(/[_\-/]/g, "");
  const stables = ["USDT", "USDC", "BUSD", "TUSD", "DAI", "FDUSD", "EUR", "GBP", "USD", "QAR", "BTC", "ETH", "BNB"];
  for (const q of stables) {
    if (clean.endsWith(q) && clean.length > q.length) return clean.slice(0, -q.length);
  }
  return clean;
}
