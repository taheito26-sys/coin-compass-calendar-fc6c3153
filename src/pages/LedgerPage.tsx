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

// ─── Constants ──────────────────────────────────────────────────────────────

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  gate: "Gate.io",
};

type AssetRecord = Awaited<ReturnType<typeof fetchAssets>>[number];

const SYMBOL_ALIASES: Record<string, string> = {
  XBT: "BTC",
  BCC: "BCH",
  BCHABC: "BCH",
  MIOTA: "IOTA",
};

function normalizeImportedSymbol(symbol: string): string {
  const normalized = extractBase(symbol)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return SYMBOL_ALIASES[normalized] || normalized;
}

function findAssetId(symbol: string, assets: AssetRecord[]): string | null {
  const candidates = new Set<string>([
    symbol.toUpperCase(),
    normalizeImportedSymbol(symbol),
  ]);

  for (const asset of assets) {
    const assetSymbol = asset.symbol.toUpperCase();
    const binanceBase = asset.binance_symbol
      ? normalizeImportedSymbol(asset.binance_symbol)
      : "";

    if (candidates.has(assetSymbol) || (binanceBase && candidates.has(binanceBase))) {
      return asset.id;
    }
  }

  return null;
}

async function saveTransactionViaApi(
  tx: {
    type: string;
    asset: string;
    qty: number;
    price: number;
    fee: number;
    venue: string;
    note: string;
    ts: number;
    externalId?: string;
  },
  assets?: AssetRecord[],
  source: "manual" | "import" = "manual",
): Promise<{ ok: boolean; source: string; missingAsset?: string }> {
  const assetCatalog = assets ?? (await fetchAssets().catch(() => [] as AssetRecord[]));
  const normalizedAsset = normalizeImportedSymbol(tx.asset);
  const assetId = findAssetId(normalizedAsset, assetCatalog);

  if (!assetId) {
    console.warn(`[ledger] Asset ${normalizedAsset} not found in assets table`);
    return { ok: false, source: "local-only", missingAsset: normalizedAsset };
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
      external_id: tx.externalId,
      source,
    });

    return { ok: true, source: "worker" };
  } catch (err: any) {
    console.error("[ledger] Save failed:", err);
    return { ok: false, source: "error" };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] || { label: type.toUpperCase(), color: "var(--muted)", icon: "·" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: "var(--lt-radius-sm)",
      background: `${meta.color}18`, color: meta.color,
      border: `1px solid ${meta.color}30`,
    }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--panel2)", borderRadius: "var(--lt-radius)", padding: "12px 16px",
      border: "1px solid var(--line)", flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "journal" | "add" | "import";

export default function LedgerPage() {
  const { state, setState, rehydrateFromBackend, toast } = useCrypto();

  // ── Tab state ──
  const [tab, setTab] = useState<Tab>("journal");

  // ── Manual entry ──
  const [txType, setTxType] = useState("buy");
  const [asset, setAsset] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Journal filters ──
  const [filterAsset, setFilterAsset] = useState("");
  const [filterType, setFilterType] = useState("");
  const [searchQ, setSearchQ] = useState("");

  // ── Edit state ──
  const [editId, setEditId] = useState<string | null>(null);
  const [editAsset, setEditAsset] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editType, setEditType] = useState("");

  // ── Import state ──
  const [importStage, setImportStage] = useState<"upload" | "preview" | "committing" | "done" | "error">("upload");
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [importCounts, setImportCounts] = useState<ImportCounts | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importedFiles = state.importedFiles || [];

  // Manual save â€” writes to both localStorage AND Worker
  const save = async () => {
    const a = normalizeImportedSymbol(asset.trim()); const q = parseFloat(qty); const p = parseFloat(price); const f = parseFloat(fee) || 0;
    if (!a || !(q > 0)) { toast("Asset and qty required", "bad"); return; }
    const total = (type === "buy" || type === "sell") ? q * p : 0;
    const ts = Date.now();

    try {
      if (isWorkerConfigured()) {
        const assets = await getAssetCatalog();
        const { assetId } = resolveAssetId(normalizedAsset, assets);

        if (!assetId) {
          toast(`Unknown asset: ${normalizedAsset}. Check the asset catalog.`, "bad");
          return;
        }

        await createTransaction({
          asset_id: assetId,
          timestamp: new Date(ts).toISOString(),
          type: txType,
          qty: q,
          unit_price: p,
          fee_amount: f,
          fee_currency: state.base,
          venue: venue || undefined,
          note: note || undefined,
          source: "manual",
        });

        await rehydrateFromBackend();
        toast("Transaction saved ✓", "good");
      } else {
        const total = (txType === "buy" || txType === "sell") ? q * p : 0;
        setState((prev) => ({
          ...prev,
          txs: [{
            id: `local_${uid()}`,
            ts, type: txType, asset: normalizedAsset,
            qty: q, price: p, total, fee: f,
            feeAsset: state.base, accountId: "acc_main", note,
          }, ...prev.txs],
        }));
        toast("Saved locally (Worker API not configured)", "bad");
      }

    // Save to backend via Worker API
    setSaving(true);
const assetCatalog = await fetchAssets().catch(() => [] as AssetRecord[]);
const result = await saveTransactionViaApi(
  { type, asset: a, qty: q, price: p, fee: f, venue, note, ts },
  assetCatalog,
  "manual",
);
setSaving(false);

    setAsset(""); setQty(""); setPrice(""); setFee("0"); setVenue(""); setNote("");
    if (result.ok) {
      toast(`Transaction saved âœ“ (via ${result.source})`, "good");
    } else {
      toast("Transaction saved locally only (backend sync failed)", "good");
    }
  };

  // ── Edit handlers ────────────────────────────────────────────────────────

  const startEdit = (t: any) => {
    setEditId(t.id);
    setEditAsset(t.asset);
    setEditQty(String(t.qty));
    setEditPrice(String(t.price));
    setEditType(t.type);
  };

  const cancelEdit = () => setEditId(null);

  const saveEdit = async () => {
    if (!editId) return;
    const existing = state.txs.find(t => t.id === editId);
    if (!existing) { setEditId(null); return; }

    const normalizedAsset = resolveAssetSymbol(editAsset || existing.asset);
    const nextType = editType || existing.type;
    const nextQty = Number.isFinite(parseFloat(editQty)) ? parseFloat(editQty) : existing.qty;
    const nextPrice = Number.isFinite(parseFloat(editPrice)) ? parseFloat(editPrice) : existing.price;

    try {
      await updateTransaction(editId, {
        type: editType,
        qty: newQty || undefined,
        unit_price: newPrice || undefined,
      });
      toast("Transaction updated âœ“", "good");
    } catch (err: any) {
      toast(err?.message || "Failed to update", "bad");
    }
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Delete this transaction? This will recalculate your portfolio.")) return;
    try {
      await deleteTransaction(id);
      toast("Transaction deleted âœ“", "good");
    } catch (err: any) {
      toast(err?.message || "Failed to delete", "bad");
    }
  };

  // ── Import handlers ──────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setImportError("");
    setImportLoading(true);
    try {
      const text = await file.text();
      const hash = await hashFile(text);

      if (importedFiles.some((f: any) => f.hash === hash)) {
        setImportError("This file was already imported (duplicate detected).");
        setImportLoading(false);
        return;
      }

      if (isWorkerConfigured()) {
        try {
          const backendFiles = await fetchImportedFiles();
          if (backendFiles.some((f: any) => f.file_hash === hash)) {
            setImportError("This file was already imported (found in backend).");
            setImportLoading(false);
            return;
          }
        } catch {}
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
      setImportError("Parse failed: " + (e.message || e));
    }
    setImportLoading(false);
  }, [importedFiles]);

  const commitImport = async () => {
    if (!importResult || importResult.rows.length === 0) return;
    if (!isWorkerConfigured()) {
      toast("Backend not configured — cannot persist import", "bad");
      return;
    }

    setImportStage("committing");
    setImportErrorMsg("");

    const counts: ImportCounts = { parsed: importResult.rows.length, accepted: 0, rejected: 0, persisted: 0, skippedDuplicate: 0, failed: 0 };

    try {
      const assets = await getAssetCatalog();
      const missingSymbols = new Set<string>();
      const batchPayload: any[] = [];

      for (const row of importResult.rows) {
        const txId = uid();
        const assetSym = normalizeImportedSymbol(row.symbol);
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
    const assetCatalog = await fetchAssets().catch(() => [] as AssetRecord[]);
const missingAssets = new Set<string>();
let synced = 0;

for (const row of importResult.rows) {
  const assetSym = normalizeImportedSymbol(row.symbol);

  const result = await saveTransactionViaApi(
    {
      type: row.side,
      asset: assetSym,
      qty: row.qty,
      price: row.unitPrice,
      fee: row.feeAmount,
      venue: EXCHANGE_LABELS[row.exchange] || row.exchange,
      note: `Import: ${row.externalId}`,
      ts: row.timestamp,
      externalId: row.externalId,
    },
    assetCatalog,
    "import",
  );

  if (result.ok) synced++;
  if (result.missingAsset) missingAssets.add(result.missingAsset);
}

      counts.accepted = batchPayload.length;

      if (batchPayload.length === 0) {
        const missing = [...missingSymbols].slice(0, 6).join(", ");
        setImportErrorMsg(missing ? `No rows accepted. Missing assets: ${missing}` : "No rows accepted.");
        setImportStage("error");
        setImportCounts(counts);
        return;
      }

      for (let i = 0; i < batchPayload.length; i += 500) {
        const result = await batchCreateTransactions(batchPayload.slice(i, i + 500));
        counts.persisted += result.created;
        counts.skippedDuplicate += result.skippedDuplicates;
        counts.failed += result.errors;
      }

      try {
        await createImportedFile({
          file_name: fileName, file_hash: fileHash,
          exchange: importResult.exchange, export_type: importResult.exportType,
          row_count: counts.persisted,
        });
      } catch (err: any) {
        if (!err.message?.includes("409")) console.warn("[import] Failed to record file:", err.message);
      }

      await rehydrateFromBackend();
      setImportCounts(counts);

      if (counts.failed > 0) {
        setImportErrorMsg(`${counts.failed} row(s) failed. ${counts.persisted} persisted successfully.`);
        setImportStage(counts.persisted > 0 ? "done" : "error");
      } else {
        setImportStage("done");
      }

      const missingText = missingSymbols.size > 0 ? ` · ${missingSymbols.size} rejected (unknown asset)` : "";
      toast(`Imported ${counts.persisted} trades (${counts.skippedDuplicate} duplicates skipped)${missingText}`,
        counts.failed > 0 || missingSymbols.size > 0 ? "bad" : "good");
    } catch (err: any) {
      setImportErrorMsg(`Backend save failed: ${err.message || "Unknown error"}`);
      setImportStage("error");
      setImportCounts(counts);
      toast("Import failed — backend error", "bad");
    }

    const summary = missingAssets.size > 0 ? `Imported ${importResult.rows.length} trades, ${synced} synced, local only for: ${[...missingAssets].join(", ")}` : `Imported ${importResult.rows.length} trades (${synced} synced)`; toast(summary, "good");
    setImportStage("done");
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

  // ── Total cost for preview ────────────────────────────────────────────────

  const previewTotal = (() => {
    if (!importResult) return { buys: 0, sells: 0 };
    let buys = 0, sells = 0;
    for (const r of importResult.rows) {
      if (r.side === "buy") buys++;
      else if (r.side === "sell") sells++;
    }
    return { buys, sells };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Sync error banner ── */}
      {state.syncStatus === "error" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
          borderRadius: "var(--lt-radius)", fontSize: 13, color: "var(--bad)",
        }}>
          <span>⚠ Backend sync error: {state.syncError || "Unknown"}. Data may be stale.</span>
          <button className="btn secondary" onClick={rehydrateFromBackend}
            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px" }}>Retry Sync</button>
        </div>
      )}

      {/* ── Stats Row ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatCard label="TOTAL TXS" value={stats.total} sub={`${stats.uniqueAssets} assets`} />
        <StatCard label="BUYS" value={stats.buys} sub={`$${(stats.totalBuyValue / 1000).toFixed(0)}K invested`} accent="var(--good)" />
        <StatCard label="SELLS" value={stats.sells} sub={`$${(stats.totalSellValue / 1000).toFixed(0)}K out`} accent="var(--bad)" />
        <StatCard label="IMPORTED FILES" value={importedFiles.length} sub="CSV imports" />
      </div>

      {/* ── Tab Bar ── */}
      <div style={{
        display: "flex", gap: 0, background: "var(--panel2)",
        border: "1px solid var(--line)", borderRadius: "var(--lt-radius)", padding: 4,
        width: "fit-content",
      }}>
        {([
          { id: "journal", label: "📋 Journal", badge: stats.total },
          { id: "add",     label: "✚ Add Transaction" },
          { id: "import",  label: "📥 Import CSV" },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "7px 16px", borderRadius: "calc(var(--lt-radius) - 2px)",
              border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6, transition: "var(--lt-tr)",
              background: tab === t.id ? "var(--brand)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--muted)",
            }}>
            {t.label}
            {"badge" in t && t.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 900, background: tab === t.id ? "rgba(255,255,255,0.25)" : "var(--brand3)",
                color: tab === t.id ? "#fff" : "var(--brand)", borderRadius: 999, padding: "1px 6px",
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
           TAB: JOURNAL
      ═══════════════════════════════════════════════════ */}
      {tab === "journal" && (
        <div className="panel">
          <div className="panel-head"><h2>+ Manual Entry</h2>{saving && <span className="pill">Syncingâ€¦</span>}</div>
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

          {/* Import history footer */}
          {importedFiles.length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>IMPORTED FILES:</span>
              {importedFiles.map((f: any, i: number) => (
                <span key={i} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 999,
                  background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--muted)",
                }}>
                  {EXCHANGE_LABELS[f.exchange] || f.exchange} · {f.rowCount} rows
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
           TAB: ADD TRANSACTION
      ═══════════════════════════════════════════════════ */}
      {tab === "add" && (
        <div className="panel">
          <div className="panel-head">
            <h2>ðŸ“¥ CSV Import</h2>
            <span className="pill">Spot Trades</span>
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>

              {/* Type */}
              <div className="form-field" style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Transaction Type</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TX_TYPES.map(tt => (
                    <button key={tt.value} onClick={() => setTxType(tt.value)} style={{
                      padding: "7px 16px", borderRadius: "var(--lt-radius-sm)", border: "1px solid",
                      borderColor: txType === tt.value ? tt.color : "var(--line)",
                      background: txType === tt.value ? `${tt.color}18` : "transparent",
                      color: txType === tt.value ? tt.color : "var(--muted)",
                      cursor: "pointer", fontSize: 12, fontWeight: txType === tt.value ? 800 : 500,
                      transition: "var(--lt-tr)",
                    }}>{tt.label}</button>
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
                  {importLoading ? <div className="muted">Parsingâ€¦</div> : (
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
                  <div className="import-warnings">{importResult.warnings.map((w, i) => <div key={i} className="import-warning">âš  {w}</div>)}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn secondary" onClick={resetImport}>Cancel</button>
                  <button className="btn" onClick={commitImport}>Commit {importResult.rowCount} Trades</button>
                </div>
              </>
            )}
            {importStage === "done" && importResult && (
              <>
                <p><strong>{importResult.rowCount}</strong> trades from <strong>{EXCHANGE_LABELS[importResult.exchange]}</strong> committed âœ“</p>
                <button className="btn" onClick={resetImport} style={{ marginTop: 8 }}>Import Another</button>
              </>
            )}

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button className="btn" onClick={save} disabled={saving || !asset || !qty}>
                {saving ? "Saving…" : "Save Transaction"}
              </button>
              <button className="btn secondary" onClick={() => { setAsset(""); setQty(""); setPrice(""); setFee("0"); setVenue(""); setNote(""); }}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
           TAB: CSV IMPORT
      ═══════════════════════════════════════════════════ */}
      {tab === "import" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

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
                        <td className="mono muted">â€”</td>
                        <td className="mono muted">â€”</td>
                        <td className="mono muted">â€”</td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={saveEdit} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--good)", fontSize: 12 }}>âœ“</button>
                            <button onClick={() => setEditId(null)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>âœ•</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono">{new Date(t.ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className={`mono ${t.type === "sell" ? "bad" : t.type === "buy" ? "good" : ""}`} style={{ fontWeight: 900 }}>{t.type.toUpperCase()}</td>
                        <td className="mono" style={{ fontWeight: 900 }}>{t.asset}</td>
                        <td className="mono">{fmtQty(t.qty)}</td>
                        <td className="mono">{t.type === "buy" || t.type === "sell" ? "$" + fmtPx(t.price) : "â€”"}</td>
                        <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee, state.base) : "â€”"}</td>
                        <td className="mono muted">{(t as any).venue || "â€”"}</td>
                        <td className="mono muted" style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "â€”"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => startEdit(t)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--text)", fontSize: 13 }}>âœŽ</button>
                            <button onClick={() => deleteTx(t.id)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--bad)", fontSize: 13 }}>ðŸ—‘</button>
                          </div>
                        </td>
                      </>
                    )}
                  </div>

                  {importResult.warnings.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {importResult.warnings.map((w, i) => (
                        <div key={i} style={{
                          padding: "8px 12px", borderRadius: "var(--lt-radius-sm)",
                          background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)",
                          color: "var(--warn)", fontSize: 12, marginBottom: 4,
                        }}>⚠ {w}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                    <strong style={{ color: "var(--text)" }}>{fileName}</strong> · {EXCHANGE_LABELS[importResult.exchange] || importResult.exchange}
                    {" · "}{importResult.exportType}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={commitImport}>
                      Commit {importResult.rowCount} Trades →
                    </button>
                    <button className="btn secondary" onClick={resetImport}>Cancel</button>
                  </div>
                </div>
              )}

              {/* STAGE: COMMITTING */}
              {importStage === "committing" && (
                <div style={{ textAlign: "center", padding: "32px 24px" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Persisting to backend…</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Do not close this page.</div>
                </div>
              )}

              {/* STAGE: DONE */}
              {importStage === "done" && importCounts && (
                <div>
                  <div style={{
                    fontSize: 40, textAlign: "center", marginBottom: 12,
                    padding: "16px 0",
                  }}>✅</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                    <StatCard label="PARSED" value={importCounts.parsed} />
                    <StatCard label="ACCEPTED" value={importCounts.accepted} />
                    <StatCard label="PERSISTED" value={importCounts.persisted} accent="var(--good)" />
                    {importCounts.skippedDuplicate > 0 && (
                      <StatCard label="DUPLICATES" value={importCounts.skippedDuplicate} />
                    )}
                    {importCounts.rejected > 0 && (
                      <StatCard label="REJECTED" value={importCounts.rejected} accent="var(--bad)" />
                    )}
                    {importCounts.failed > 0 && (
                      <StatCard label="FAILED" value={importCounts.failed} accent="var(--bad)" />
                    )}
                  </div>
                  {importErrorMsg && (
                    <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--lt-radius-sm)", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "var(--bad)", fontSize: 12 }}>
                      {importErrorMsg}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={resetImport}>Import Another File</button>
                    <button className="btn secondary" onClick={() => setTab("journal")}>View Journal</button>
                  </div>
                </div>
              )}

              {/* STAGE: ERROR */}
              {importStage === "error" && (
                <div>
                  <div style={{
                    marginBottom: 16, padding: "16px", borderRadius: "var(--lt-radius)",
                    background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
                    color: "var(--bad)",
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Import Failed</div>
                    <div style={{ fontSize: 13 }}>{importErrorMsg || "Unknown error"}</div>
                  </div>
                  {importCounts && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                      <StatCard label="PARSED" value={importCounts.parsed} />
                      <StatCard label="ACCEPTED" value={importCounts.accepted} />
                      <StatCard label="PERSISTED" value={importCounts.persisted} accent="var(--good)" />
                      <StatCard label="FAILED" value={importCounts.failed} accent="var(--bad)" />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={commitImport}>Retry</button>
                    <button className="btn secondary" onClick={resetImport}>Start Over</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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






