import { useState, useRef, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { importCSV, hashFile } from "@/lib/importers";
import type { ParseResult } from "@/lib/importers";
import { uid, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { createTransaction, createImportedFile, isWorkerConfigured } from "@/lib/api";
import { getAssetCatalog, resolveAssetId, resolveAssetSymbol } from "@/lib/assetResolver";

type Stage = "upload" | "preview" | "done";

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  gate: "Gate.io",
};

export default function ImportPage() {
  const { state, setState, toast } = useCrypto();
  const [stage, setStage] = useState<Stage>("upload");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const importedFiles = state.importedFiles || [];

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const text = await file.text();
      const hash = await hashFile(text);

      if (importedFiles.some((f: any) => f.hash === hash)) {
        setError("This file has already been imported (duplicate detected by file hash).");
        setLoading(false);
        return;
      }

      const parsed = await importCSV(text, file.name);
      setFileName(file.name);
      setFileHash(hash);
      setResult(parsed);

      if (parsed.rows.length === 0 && parsed.warnings.length > 0) {
        setError(parsed.warnings[0]);
        setStage("upload");
      } else {
        setStage("preview");
      }
    } catch (e: any) {
      setError("Failed to parse file: " + (e.message || e));
    }
    setLoading(false);
  }, [importedFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const commit = async () => {
    if (!result || result.rows.length === 0) return;

    const newTxs: typeof state.txs = [];
    let synced = 0;
    const missingSymbols = new Set<string>();

    if (isWorkerConfigured()) {
      try {
        const assets = await getAssetCatalog();

        for (const row of result.rows) {
          const { assetId, symbol } = resolveAssetId(row.symbol, assets);
          if (!assetId) {
            missingSymbols.add(symbol);
            continue;
          }

          try {
            const created = await createTransaction({
              asset_id: assetId,
              timestamp: new Date(row.timestamp).toISOString(),
              type: row.side,
              qty: row.qty,
              unit_price: row.unitPrice,
              fee_amount: row.feeAmount,
              fee_currency: row.feeAsset || state.base,
              venue: EXCHANGE_LABELS[row.exchange] || row.exchange,
              note: `Import: ${row.externalId}`,
              source: "csv-import",
              external_id: row.externalId || undefined,
            });

            newTxs.push({
              id: created.id,
              ts: row.timestamp,
              type: row.side,
              asset: symbol,
              qty: row.qty,
              price: row.unitPrice,
              total: row.grossValue,
              fee: row.feeAmount,
              feeAsset: row.feeAsset || state.base,
              accountId: "acc_main",
              note: `Import: ${EXCHANGE_LABELS[row.exchange]} ${row.externalId}`,
              lots: "",
            });
            synced++;
          } catch (err: any) {
            console.warn("[import] Failed row:", err?.message || err);
          }
        }
      } catch (err: any) {
        toast(err?.message || "Import sync failed", "bad");
        return;
      }
    } else {
      for (const row of result.rows) {
        newTxs.push({
          id: `local_${uid()}`,
          ts: row.timestamp,
          type: row.side,
          asset: resolveAssetSymbol(row.symbol),
          qty: row.qty,
          price: row.unitPrice,
          total: row.grossValue,
          fee: row.feeAmount,
          feeAsset: row.feeAsset || state.base,
          accountId: "acc_main",
          note: `Import: ${EXCHANGE_LABELS[row.exchange]} ${row.externalId}`,
          lots: "",
        });
      }
      synced = newTxs.length;
    }

    if (newTxs.length === 0) {
      const missing = [...missingSymbols].slice(0, 6).join(", ");
      toast(missing ? `No rows imported. Missing assets: ${missing}` : "No rows imported.", "bad");
      return;
    }

    setState((prev) => ({
      ...prev,
      txs: [...prev.txs, ...newTxs],
      importedFiles: [...(prev.importedFiles || []), {
        name: fileName,
        hash: fileHash,
        importedAt: Date.now(),
        exchange: result.exchange,
        exportType: result.exportType,
        rowCount: result.rows.length,
      }],
    }));

    if (isWorkerConfigured()) {
      try {
        await createImportedFile({
          file_name: fileName,
          file_hash: fileHash,
          exchange: result.exchange,
          export_type: result.exportType,
          row_count: result.rows.length,
        });
      } catch (err: any) {
        console.warn("[import] Failed to record imported file:", err.message);
      }
    }

    const missingText = missingSymbols.size > 0
      ? ` · ${missingSymbols.size} skipped (missing asset mapping)`
      : "";

    toast(
      `${isWorkerConfigured() ? "Imported" : "Imported local-only"} ${newTxs.length}/${result.rows.length} trades (${synced} synced)${missingText}`,
      missingSymbols.size > 0 ? "bad" : "good",
    );
    setStage("done");
  };

  const reset = () => {
    setStage("upload");
    setResult(null);
    setFileName("");
    setFileHash("");
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      {/* Upload stage */}
      {stage === "upload" && (
        <div className="panel">
          <div className="panel-head">
            <h2>Import Spot Trade History</h2>
            <span className="pill">v1A · Trades Only</span>
          </div>
          <div className="panel-body">
            <div className="import-supported">
              <div className="import-exchanges">
                {["binance", "bybit", "okx", "gate"].map(ex => (
                  <span key={ex} className="pill">{EXCHANGE_LABELS[ex]}</span>
                ))}
              </div>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                Accepted: Spot Trade History CSV exports only.<br/>
                Rejected: Futures, Margin, Options, Earn, P2P, Copy Trading, Deposits, Withdrawals.
              </p>
            </div>

            <div
              className="import-drop"
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {loading ? (
                <div className="muted">Parsing…</div>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" width="32" height="32"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div style={{ marginTop: 8 }}>Drop CSV file or click to browse</div>
                  <div className="muted" style={{ fontSize: 11 }}>Binance · Bybit · OKX · Gate.io</div>
                </>
              )}
            </div>

            {error && <div className="import-error">{error}</div>}

            {importedFiles.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 13, marginBottom: 6, opacity: 0.7 }}>Previously Imported</h3>
                <div className="tableWrap"><table>
                  <thead><tr><th>File</th><th>Exchange</th><th>Rows</th><th>Date</th></tr></thead>
                  <tbody>
                    {importedFiles.map((f: any, i: number) => (
                      <tr key={i}>
                        <td className="mono" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</td>
                        <td>{EXCHANGE_LABELS[f.exchange] || f.exchange}</td>
                        <td className="mono">{f.rowCount}</td>
                        <td className="mono muted">{new Date(f.importedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview stage */}
      {stage === "preview" && result && (
        <>
          <div className="panel">
            <div className="panel-head">
              <h2>Preview Import</h2>
              <span className="pill">{EXCHANGE_LABELS[result.exchange]}</span>
              <span className="pill">{result.exportType}</span>
            </div>
            <div className="panel-body">
              <div className="import-summary">
                <div className="import-stat">
                  <div className="import-stat-val good">{result.rowCount}</div>
                  <div className="import-stat-lbl">Parsed Trades</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-val" style={{ color: result.skippedCount > 0 ? "var(--bad)" : "var(--muted)" }}>{result.skippedCount}</div>
                  <div className="import-stat-lbl">Skipped</div>
                </div>
                <div className="import-stat">
                  <div className="import-stat-val">{result.warnings.length}</div>
                  <div className="import-stat-lbl">Warnings</div>
                </div>
                {result.dateRange && (
                  <div className="import-stat">
                    <div className="import-stat-val mono" style={{ fontSize: 13 }}>
                      {new Date(result.dateRange[0]).toLocaleDateString()} – {new Date(result.dateRange[1]).toLocaleDateString()}
                    </div>
                    <div className="import-stat-lbl">Date Range</div>
                  </div>
                )}
              </div>

              {result.warnings.length > 0 && (
                <div className="import-warnings">
                  {result.warnings.map((w, i) => <div key={i} className="import-warning">⚠ {w}</div>)}
                </div>
              )}

              <div className="tableWrap" style={{ maxHeight: 400, overflow: "auto" }}>
                <table>
                  <thead><tr><th>Date</th><th>Side</th><th>Symbol</th><th>Qty</th><th>Price</th><th>Value</th><th>Fee</th><th>ID</th></tr></thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{new Date(r.timestamp).toLocaleString()}</td>
                        <td className={`mono ${r.side === "buy" ? "good" : "bad"}`} style={{ fontWeight: 900 }}>{r.side.toUpperCase()}</td>
                        <td className="mono" style={{ fontWeight: 900 }}>{r.symbol}</td>
                        <td className="mono">{fmtQty(r.qty)}</td>
                        <td className="mono">{fmtPx(r.unitPrice)}</td>
                        <td className="mono">{fmtFiat(r.grossValue, state.base)}</td>
                        <td className="mono">{r.feeAmount > 0 ? `${fmtQty(r.feeAmount)} ${r.feeAsset}` : "—"}</td>
                        <td className="mono muted" style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{r.externalId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rows.length > 100 && (
                <div className="muted" style={{ padding: "8px 0", fontSize: 12 }}>Showing first 100 of {result.rows.length} rows</div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn secondary" onClick={reset}>Cancel</button>
                <button className="btn" onClick={commit}>Commit {result.rowCount} Trades</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Done stage */}
      {stage === "done" && result && (
        <div className="panel">
          <div className="panel-head">
            <h2>Import Complete ✓</h2>
          </div>
          <div className="panel-body">
            <p><strong>{result.rowCount}</strong> trades from <strong>{EXCHANGE_LABELS[result.exchange]}</strong> committed to your ledger.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={reset}>Import Another File</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
