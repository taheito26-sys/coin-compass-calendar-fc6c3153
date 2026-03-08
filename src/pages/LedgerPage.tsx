import { useState, useRef, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { uid, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { importCSV, hashFile } from "@/lib/importers";
import type { ParseResult } from "@/lib/importers";
import CoinAutocomplete from "@/components/CoinAutocomplete";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
  createImportedFile,
  fetchImportedFiles,
  isWorkerConfigured,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetId, resolveAssetSymbol } from "@/lib/assetResolver";

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  gate: "Gate.io",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX32_RE = /^[0-9a-f]{32}$/i;

function isBackendId(id: string): boolean {
  return UUID_RE.test(id) || HEX32_RE.test(id);
}

/** Import result counts shown to the user */
interface ImportCounts {
  parsed: number;
  accepted: number;
  rejected: number;
  persisted: number;
  skippedDuplicate: number;
  failed: number;
}

export default function LedgerPage() {
  const { state, setState, rehydrateFromBackend, toast } = useCrypto();

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
  const [importStage, setImportStage] = useState<"upload" | "preview" | "committing" | "done" | "error">("upload");
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [importCounts, setImportCounts] = useState<ImportCounts | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState("");
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

  const save = async () => {
    const normalizedAsset = resolveAssetSymbol(asset);
    const q = parseFloat(qty);
    const p = parseFloat(price) || 0;
    const f = parseFloat(fee) || 0;

    if (!normalizedAsset || !(q > 0)) {
      toast("Asset and qty required", "bad");
      return;
    }

    const ts = Date.now();
    setSaving(true);

    try {
      if (isWorkerConfigured()) {
        const assets = await getAssetCatalog();
        const { assetId } = resolveAssetId(normalizedAsset, assets);

        if (!assetId) {
          toast(`Asset mapping failed for ${normalizedAsset}. Add this asset before saving.`, "bad");
          return;
        }

        const created = await createTransaction({
          asset_id: assetId,
          timestamp: new Date(ts).toISOString(),
          type,
          qty: q,
          unit_price: p,
          fee_amount: f,
          fee_currency: state.base,
          venue: venue || undefined,
          note: note || undefined,
          source: "manual",
        });

        // Refresh from backend to get canonical state
        await rehydrateFromBackend();
        toast("Transaction saved ✓", "good");
      } else {
        const total = (type === "buy" || type === "sell") ? q * p : 0;
        setState((prev) => ({
          ...prev,
          txs: [{
            id: `local_${uid()}`,
            ts,
            type,
            asset: normalizedAsset,
            qty: q,
            price: p,
            total,
            fee: f,
            feeAsset: state.base,
            accountId: "acc_main",
            note,
            lots: "",
          }, ...prev.txs],
        }));
        toast("Saved locally only (Worker API not configured)", "bad");
      }

      setAsset("");
      setQty("");
      setPrice("");
      setFee("0");
      setVenue("");
      setNote("");
    } catch (err: any) {
      console.error("[ledger] Save failed:", err);
      toast(err?.message || "Failed to save transaction", "bad");
    } finally {
      setSaving(false);
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

    const existing = state.txs.find((t) => t.id === editId);
    if (!existing) {
      setEditId(null);
      return;
    }

    const normalizedAsset = resolveAssetSymbol(editAsset || existing.asset);
    const nextType = editType || existing.type;
    const nextQty = Number.isFinite(parseFloat(editQty)) ? parseFloat(editQty) : existing.qty;
    const nextPrice = Number.isFinite(parseFloat(editPrice)) ? parseFloat(editPrice) : existing.price;

    try {
      if (isWorkerConfigured() && isBackendId(editId)) {
        const assets = await getAssetCatalog();
        const { assetId } = resolveAssetId(normalizedAsset, assets);
        if (!assetId) {
          toast(`Asset mapping failed for ${normalizedAsset}. Update aborted.`, "bad");
          return;
        }

        await updateTransaction(editId, {
          asset_id: assetId,
          type: nextType,
          qty: nextQty,
          unit_price: nextPrice,
        });

        // Refresh from backend to recompute derived state
        await rehydrateFromBackend();
        toast("Transaction updated ✓", "good");
      } else {
        const nextTotal = (nextType === "buy" || nextType === "sell") ? nextQty * nextPrice : 0;
        setState((prev) => ({
          ...prev,
          txs: prev.txs.map((t) => t.id === editId ? {
            ...t,
            asset: normalizedAsset,
            qty: nextQty,
            price: nextPrice,
            type: nextType,
            total: nextTotal,
          } : t),
        }));
        toast("Updated local-only transaction (not synced)", "bad");
      }

      setEditId(null);
    } catch (err: any) {
      console.error("[ledger] Update failed:", err);
      toast(err?.message || "Failed to update transaction", "bad");
    }
  };

  const deleteTx = async (id: string) => {
    try {
      if (isWorkerConfigured() && isBackendId(id)) {
        await deleteTransaction(id);
        // Refresh from backend to recompute derived state
        await rehydrateFromBackend();
        toast("Transaction deleted ✓", "good");
      } else {
        setState((prev) => ({ ...prev, txs: prev.txs.filter((t) => t.id !== id) }));
        toast("Deleted local-only transaction", "good");
      }
    } catch (err: any) {
      console.error("[ledger] Delete failed:", err);
      toast(err?.message || "Failed to delete transaction", "bad");
    }
  };

  // Import handlers
  const handleFile = useCallback(async (file: File) => {
    setImportError("");
    setImportLoading(true);
    try {
      const text = await file.text();
      const hash = await hashFile(text);

      // Check local imported files list
      if (importedFiles.some((f: any) => f.hash === hash)) {
        setImportError("This file has already been imported (duplicate detected).");
        setImportLoading(false);
        return;
      }

      // Also check backend imported files
      if (isWorkerConfigured()) {
        try {
          const backendFiles = await fetchImportedFiles();
          if (backendFiles.some((f: any) => f.file_hash === hash)) {
            setImportError("This file has already been imported (duplicate detected in backend).");
            setImportLoading(false);
            return;
          }
        } catch {
          // If we can't check backend, proceed with local check only
        }
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

  /**
   * BACKEND-FIRST import commit.
   * 1. Resolve asset IDs
   * 2. Build batch payload with external_ids for idempotency
   * 3. Persist to backend via batch API
   * 4. Record imported file metadata in backend
   * 5. Only THEN refresh UI from backend response
   * 6. Show explicit counts
   */
  const commitImport = async () => {
    if (!importResult || importResult.rows.length === 0) return;

    if (!isWorkerConfigured()) {
      toast("Backend not configured — cannot persist import durably", "bad");
      return;
    }

    setImportStage("committing");
    setImportErrorMsg("");

    const counts: ImportCounts = {
      parsed: importResult.rows.length,
      accepted: 0,
      rejected: 0,
      persisted: 0,
      skippedDuplicate: 0,
      failed: 0,
    };

    try {
      const assets = await getAssetCatalog();
      const missingSymbols = new Set<string>();

      // Build batch payload
      const batchPayload: Array<{
        asset_id: string;
        timestamp: string;
        type: string;
        qty: number;
        unit_price: number;
        fee_amount: number;
        fee_currency: string;
        venue: string;
        note: string;
        source: string;
        external_id: string;
      }> = [];

      for (const row of importResult.rows) {
        const { assetId, symbol } = resolveAssetId(row.symbol, assets);
        if (!assetId) {
          missingSymbols.add(symbol);
          counts.rejected++;
          continue;
        }

        // Deterministic external_id for idempotency: exchange:externalId or exchange:timestamp:symbol:side:qty:price
        const externalId = row.externalId
          ? `${row.exchange}:${row.externalId}`
          : `${row.exchange}:${row.timestamp}:${symbol}:${row.side}:${row.qty}:${row.unitPrice}`;

        batchPayload.push({
          asset_id: assetId,
          timestamp: new Date(row.timestamp).toISOString(),
          type: row.side,
          qty: row.qty,
          unit_price: row.unitPrice,
          fee_amount: row.feeAmount,
          fee_currency: row.feeAsset || state.base,
          venue: EXCHANGE_LABELS[row.exchange] || row.exchange,
          note: `Import: ${row.externalId || ""}`,
          source: "csv-import",
          external_id: externalId,
        });
      }

      counts.accepted = batchPayload.length;

      if (batchPayload.length === 0) {
        const missing = [...missingSymbols].slice(0, 6).join(", ");
        setImportErrorMsg(missing ? `No rows accepted. Missing assets: ${missing}` : "No rows accepted.");
        setImportStage("error");
        setImportCounts(counts);
        return;
      }

      // Persist to backend in batches of 500
      for (let i = 0; i < batchPayload.length; i += 500) {
        const batch = batchPayload.slice(i, i + 500);
        const result = await batchCreateTransactions(batch);
        counts.persisted += result.created;
        counts.skippedDuplicate += result.skippedDuplicates;
        counts.failed += result.errors;
      }

      // Record imported file metadata in backend
      try {
        await createImportedFile({
          file_name: fileName,
          file_hash: fileHash,
          exchange: importResult.exchange,
          export_type: importResult.exportType,
          row_count: counts.persisted,
        });
      } catch (err: any) {
        // 409 = already recorded, fine
        if (!err.message?.includes("409")) {
          console.warn("[import] Failed to record imported file:", err.message);
        }
      }

      // NOW refresh UI from backend (canonical source of truth)
      await rehydrateFromBackend();

      setImportCounts(counts);

      if (counts.failed > 0) {
        setImportErrorMsg(`${counts.failed} row(s) failed to persist. ${counts.persisted} persisted successfully.`);
        setImportStage(counts.persisted > 0 ? "done" : "error");
      } else {
        setImportStage("done");
      }

      const missingText = missingSymbols.size > 0
        ? ` · ${missingSymbols.size} rejected (missing asset)`
        : "";

      toast(
        `Imported ${counts.persisted} trades (${counts.skippedDuplicate} duplicates skipped)${missingText}`,
        counts.failed > 0 || missingSymbols.size > 0 ? "bad" : "good",
      );
    } catch (err: any) {
      console.error("[import] Backend persistence failed:", err);
      setImportErrorMsg(`Backend save failed: ${err.message || "Unknown error"}. No data was committed to your portfolio.`);
      setImportStage("error");
      setImportCounts(counts);
      toast("Import failed — backend persistence error", "bad");
    }
  };

  const resetImport = () => {
    setImportStage("upload");
    setImportResult(null);
    setImportCounts(null);
    setImportErrorMsg("");
    setFileName("");
    setFileHash("");
    setImportError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const txs = state.txs.slice().sort((a, b) => b.ts - a.ts).slice(0, 200);

  return (
    <>
      {/* Top row: Manual Entry + CSV Import side by side */}
      <div className="ledger-top-grid">
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
            {importStage === "committing" && (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 14, marginBottom: 8 }}>Persisting to backend…</div>
                <div className="muted" style={{ fontSize: 12 }}>Do not close this page.</div>
              </div>
            )}
            {importStage === "done" && importCounts && (
              <>
                <div className="import-summary" style={{ marginBottom: 8, flexWrap: "wrap" }}>
                  <div className="import-stat"><div className="import-stat-val">{importCounts.parsed}</div><div className="import-stat-lbl">Parsed</div></div>
                  <div className="import-stat"><div className="import-stat-val">{importCounts.accepted}</div><div className="import-stat-lbl">Accepted</div></div>
                  <div className="import-stat"><div className="import-stat-val good">{importCounts.persisted}</div><div className="import-stat-lbl">Persisted</div></div>
                  {importCounts.skippedDuplicate > 0 && (
                    <div className="import-stat"><div className="import-stat-val" style={{ color: "var(--muted)" }}>{importCounts.skippedDuplicate}</div><div className="import-stat-lbl">Duplicates</div></div>
                  )}
                  {importCounts.rejected > 0 && (
                    <div className="import-stat"><div className="import-stat-val" style={{ color: "var(--bad)" }}>{importCounts.rejected}</div><div className="import-stat-lbl">Rejected</div></div>
                  )}
                  {importCounts.failed > 0 && (
                    <div className="import-stat"><div className="import-stat-val" style={{ color: "var(--bad)" }}>{importCounts.failed}</div><div className="import-stat-lbl">Failed</div></div>
                  )}
                </div>
                {importErrorMsg && <div className="import-error" style={{ marginBottom: 8 }}>{importErrorMsg}</div>}
                <button className="btn" onClick={resetImport} style={{ marginTop: 8 }}>Import Another</button>
              </>
            )}
            {importStage === "error" && (
              <>
                <div className="import-error" style={{ marginBottom: 12 }}>
                  <strong>Import failed</strong><br/>
                  {importErrorMsg || "Unknown error"}
                </div>
                {importCounts && (
                  <div className="import-summary" style={{ marginBottom: 8 }}>
                    <div className="import-stat"><div className="import-stat-val">{importCounts.parsed}</div><div className="import-stat-lbl">Parsed</div></div>
                    <div className="import-stat"><div className="import-stat-val">{importCounts.accepted}</div><div className="import-stat-lbl">Accepted</div></div>
                    <div className="import-stat"><div className="import-stat-val good">{importCounts.persisted}</div><div className="import-stat-lbl">Persisted</div></div>
                    <div className="import-stat"><div className="import-stat-val" style={{ color: "var(--bad)" }}>{importCounts.failed}</div><div className="import-stat-lbl">Failed</div></div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn secondary" onClick={resetImport}>Cancel</button>
                  <button className="btn" onClick={commitImport}>Retry Import</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sync status banner */}
      {state.syncStatus === "error" && (
        <div className="panel" style={{ borderColor: "var(--bad)", marginBottom: 12 }}>
          <div className="panel-body" style={{ color: "var(--bad)", fontSize: 13 }}>
            ⚠ Backend sync error: {state.syncError || "Unknown"}. Data shown may be stale.
            <button className="btn secondary" onClick={rehydrateFromBackend} style={{ marginLeft: 8, fontSize: 11 }}>Retry</button>
          </div>
        </div>
      )}

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
                        <td className="mono">{t.type === "buy" || t.type === "sell" ? fmtPx(t.price) : "—"}</td>
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
