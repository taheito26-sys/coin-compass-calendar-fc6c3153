import { useState, useRef, useCallback, useMemo } from "react";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX32_RE = /^[0-9a-f]{32}$/i;
function isBackendId(id: string): boolean {
  return UUID_RE.test(id) || HEX32_RE.test(id);
}

const TX_TYPES = [
  { value: "buy", label: "Buy", color: "var(--good)" },
  { value: "sell", label: "Sell", color: "var(--bad)" },
  { value: "transfer_in", label: "Transfer In", color: "var(--t5)" },
  { value: "transfer_out", label: "Transfer Out", color: "var(--warn)" },
  { value: "reward", label: "Reward", color: "var(--t2)" },
  { value: "adjustment", label: "Adjustment", color: "var(--muted)" },
];

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  buy:           { label: "BUY",          color: "var(--good)", icon: "↑" },
  sell:          { label: "SELL",         color: "var(--bad)",  icon: "↓" },
  transfer_in:   { label: "IN",           color: "var(--t5)",   icon: "→" },
  transfer_out:  { label: "OUT",          color: "var(--warn)", icon: "←" },
  reward:        { label: "REWARD",       color: "var(--t2)",   icon: "★" },
  adjustment:    { label: "ADJ",          color: "var(--muted)",icon: "≈" },
};

interface ImportCounts {
  parsed: number;
  accepted: number;
  rejected: number;
  persisted: number;
  skippedDuplicate: number;
  failed: number;
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

  // ── Derived data ──────────────────────────────────────────────────────────

  const allTxs = useMemo(() =>
    state.txs.slice().sort((a, b) => b.ts - a.ts),
  [state.txs]);

  const filteredTxs = useMemo(() => {
    return allTxs.filter(t => {
      if (filterType && t.type !== filterType) return false;
      const q = searchQ.toLowerCase();
      if (q && !t.asset.toLowerCase().includes(q) && !(t.note || "").toLowerCase().includes(q)) return false;
      return true;
    }).slice(0, 300);
  }, [allTxs, filterType, searchQ]);

  const stats = useMemo(() => {
    const buys = allTxs.filter(t => t.type === "buy");
    const sells = allTxs.filter(t => t.type === "sell");
    const totalBuyValue = buys.reduce((s, t) => s + t.qty * t.price, 0);
    const totalSellValue = sells.reduce((s, t) => s + t.qty * t.price, 0);
    const uniqueAssets = new Set(allTxs.map(t => t.asset)).size;
    return { total: allTxs.length, buys: buys.length, sells: sells.length, uniqueAssets, totalBuyValue, totalSellValue };
  }, [allTxs]);

  // ── Save manual entry ────────────────────────────────────────────────────

  const save = async () => {
    const normalizedAsset = resolveAssetSymbol(asset);
    const q = parseFloat(qty);
    const p = parseFloat(price) || 0;
    const f = parseFloat(fee) || 0;

    if (!normalizedAsset || !(q > 0)) {
      toast("Asset and quantity are required", "bad");
      return;
    }

    setSaving(true);
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

      setAsset(""); setQty(""); setPrice(""); setFee("0"); setVenue(""); setNote("");
      // Auto-jump to journal after save
      setTab("journal");
    } catch (err: any) {
      toast(err?.message || "Failed to save transaction", "bad");
    } finally {
      setSaving(false);
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
      if (isWorkerConfigured() && isBackendId(editId)) {
        const assets = await getAssetCatalog();
        const { assetId } = resolveAssetId(normalizedAsset, assets);
        if (!assetId) { toast(`Unknown asset: ${normalizedAsset}`, "bad"); return; }
        await updateTransaction(editId, { asset_id: assetId, type: nextType, qty: nextQty, unit_price: nextPrice });
        await rehydrateFromBackend();
        toast("Transaction updated ✓", "good");
      } else {
        setState(prev => ({
          ...prev,
          txs: prev.txs.map(t => t.id === editId
            ? { ...t, asset: normalizedAsset, qty: nextQty, price: nextPrice, type: nextType, total: nextQty * nextPrice }
            : t),
        }));
        toast("Updated (local-only)", "bad");
      }
      setEditId(null);
    } catch (err: any) {
      toast(err?.message || "Failed to update", "bad");
    }
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Delete this transaction? This will recalculate your portfolio.")) return;
    try {
      if (isWorkerConfigured() && isBackendId(id)) {
        await deleteTransaction(id);
        await rehydrateFromBackend();
        toast("Deleted ✓", "good");
      } else {
        setState(prev => ({ ...prev, txs: prev.txs.filter(t => t.id !== id) }));
        toast("Deleted (local-only)", "good");
      }
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
        const { assetId, symbol } = resolveAssetId(row.symbol, assets);
        if (!assetId) { missingSymbols.add(symbol); counts.rejected++; continue; }

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
          note: row.externalId ? `Import: ${row.externalId}` : "",
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
          <div className="panel-head">
            <h2>Transaction Journal</h2>
            {state.syncStatus === "loading" && <span className="pill">Syncing…</span>}
          </div>

          {/* Filters */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="inp" placeholder="🔍 Search asset or note…"
              value={searchQ} onChange={e => setSearchQ(e.target.value)}
              style={{ minWidth: 200, flex: 1 }}
            />
            <select className="inp" value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ minWidth: 130 }}>
              <option value="">All Types</option>
              {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {(searchQ || filterType) && (
              <button className="btn secondary" style={{ fontSize: 11, padding: "4px 10px" }}
                onClick={() => { setSearchQ(""); setFilterType(""); }}>Clear</button>
            )}
            <span className="pill" style={{ alignSelf: "center" }}>{filteredTxs.length} rows</span>
          </div>

          <div className="panel-body" style={{ padding: 0 }}>
            {filteredTxs.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                  {allTxs.length === 0 ? "No transactions yet" : "No results match your filter"}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
                  {allTxs.length === 0
                    ? "Add your first trade manually or import a CSV from Binance, Bybit, OKX, or Gate.io"
                    : "Try a different search term or clear the filter"}
                </div>
                {allTxs.length === 0 && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button className="btn" onClick={() => setTab("add")}>✚ Add Transaction</button>
                    <button className="btn secondary" onClick={() => setTab("import")}>📥 Import CSV</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>TYPE</th>
                      <th>ASSET</th>
                      <th>QTY</th>
                      <th>PRICE</th>
                      <th>TOTAL</th>
                      <th>FEE</th>
                      <th>VENUE</th>
                      <th>NOTE</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.map(t => (
                      <tr key={t.id} style={{ transition: "background 0.12s" }}>
                        {editId === t.id ? (
                          <>
                            <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                              {new Date(t.ts).toLocaleDateString()}
                            </td>
                            <td>
                              <select className="inp" value={editType} onChange={e => setEditType(e.target.value)}
                                style={{ width: 90, padding: "2px 4px", fontSize: 11 }}>
                                {TX_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                              </select>
                            </td>
                            <td>
                              <input className="inp" value={editAsset} onChange={e => setEditAsset(e.target.value)}
                                style={{ width: 70, padding: "2px 4px", fontSize: 11 }} />
                            </td>
                            <td>
                              <input className="inp" type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                                style={{ width: 100, padding: "2px 4px", fontSize: 11 }} />
                            </td>
                            <td>
                              <input className="inp" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                                style={{ width: 90, padding: "2px 4px", fontSize: 11 }} />
                            </td>
                            <td className="mono muted">—</td>
                            <td className="mono muted">—</td>
                            <td className="mono muted">—</td>
                            <td className="mono muted">—</td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={saveEdit} style={{
                                  background: "rgba(22,163,74,0.12)", border: "1px solid var(--good)",
                                  borderRadius: "var(--lt-radius-sm)", padding: "4px 10px",
                                  cursor: "pointer", color: "var(--good)", fontSize: 12, fontWeight: 700,
                                }}>✓</button>
                                <button onClick={cancelEdit} style={{
                                  background: "none", border: "1px solid var(--line)",
                                  borderRadius: "var(--lt-radius-sm)", padding: "4px 10px",
                                  cursor: "pointer", color: "var(--muted)", fontSize: 12,
                                }}>✕</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="mono" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                              {new Date(t.ts).toLocaleString(undefined, {
                                month: "short", day: "numeric", year: "2-digit",
                                hour: "2-digit", minute: "2-digit"
                              })}
                            </td>
                            <td><TypeBadge type={t.type} /></td>
                            <td className="mono" style={{ fontWeight: 800, color: "var(--text)" }}>{t.asset}</td>
                            <td className="mono">{fmtQty(t.qty)}</td>
                            <td className="mono">{t.price > 0 ? fmtPx(t.price) : "—"}</td>
                            <td className="mono" style={{ color: t.type === "buy" ? "var(--good)" : t.type === "sell" ? "var(--bad)" : "var(--muted)" }}>
                              {(t.type === "buy" || t.type === "sell") && t.price > 0
                                ? `$${fmtFiat(t.qty * t.price)}`
                                : "—"}
                            </td>
                            <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee) : "—"}</td>
                            <td className="mono muted" style={{ fontSize: 11 }}>{(t as any).venue || "—"}</td>
                            <td className="mono muted" style={{ fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.note || "—"}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => startEdit(t)} title="Edit" style={{
                                  background: "none", border: "1px solid var(--line)",
                                  borderRadius: "var(--lt-radius-sm)", padding: "4px 8px",
                                  cursor: "pointer", color: "var(--muted)", fontSize: 13,
                                  transition: "var(--lt-tr)",
                                }}>✎</button>
                                <button onClick={() => deleteTx(t.id)} title="Delete" style={{
                                  background: "none", border: "1px solid var(--line)",
                                  borderRadius: "var(--lt-radius-sm)", padding: "4px 8px",
                                  cursor: "pointer", color: "var(--bad)", fontSize: 13,
                                  transition: "var(--lt-tr)",
                                }}>✕</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
            <h2>Add Transaction</h2>
            {saving && <span className="pill">Saving…</span>}
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
              </div>

              {/* Asset */}
              <div className="form-field">
                <label className="form-label">Asset *</label>
                <CoinAutocomplete value={asset} onChange={setAsset} />
              </div>

              {/* Quantity */}
              <div className="form-field">
                <label className="form-label">Quantity *</label>
                <input className="inp" type="number" placeholder="0.00" value={qty} onChange={e => setQty(e.target.value)} />
              </div>

              {/* Unit Price */}
              <div className="form-field">
                <label className="form-label">Unit Price ({state.base})</label>
                <input className="inp" type="number" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} />
              </div>

              {/* Fee */}
              <div className="form-field">
                <label className="form-label">Fee ({state.base})</label>
                <input className="inp" type="number" placeholder="0.00" value={fee} onChange={e => setFee(e.target.value)} />
              </div>

              {/* Venue */}
              <div className="form-field">
                <label className="form-label">Venue / Exchange</label>
                <input className="inp" placeholder="Binance, Coinbase…" value={venue} onChange={e => setVenue(e.target.value)} />
              </div>

              {/* Note */}
              <div className="form-field">
                <label className="form-label">Note (optional)</label>
                <input className="inp" placeholder="Add a tag or note…" value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>

            {/* Preview row */}
            {asset && qty && price && (
              <div style={{
                marginTop: 16, padding: "12px 16px", borderRadius: "var(--lt-radius)",
                background: "var(--panel2)", border: "1px solid var(--line)",
                display: "flex", gap: 16, alignItems: "center", fontSize: 13,
              }}>
                <TypeBadge type={txType} />
                <span style={{ fontWeight: 700 }}>{parseFloat(qty) || 0} {resolveAssetSymbol(asset) || asset}</span>
                <span style={{ color: "var(--muted)" }}>@</span>
                <span>${parseFloat(price) || 0}</span>
                <span style={{ color: "var(--muted)" }}>→</span>
                <span style={{ fontWeight: 800, color: "var(--good)" }}>
                  ${((parseFloat(qty) || 0) * (parseFloat(price) || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} total
                </span>
              </div>
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

          {/* Supported exchanges */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(EXCHANGE_LABELS).map(([key, label]) => (
              <div key={key} style={{
                padding: "8px 16px", borderRadius: "var(--lt-radius)",
                background: "var(--panel)", border: "1px solid var(--line)",
                fontSize: 13, fontWeight: 700, color: "var(--text)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 8, color: "var(--good)" }}>●</span>
                {label}
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>Spot</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>📥 CSV Import</h2>
              <span className="pill">Spot Trades Only</span>
            </div>
            <div className="panel-body">

              {/* STAGE: UPLOAD */}
              {importStage === "upload" && (
                <>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(false);
                      const f = e.dataTransfer.files[0];
                      if (f) handleFile(f);
                    }}
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "var(--brand)" : "var(--line)"}`,
                      borderRadius: "var(--lt-radius)",
                      padding: "48px 24px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: dragOver ? "var(--brand3)" : "var(--panel2)",
                      transition: "var(--lt-tr)",
                    }}
                  >
                    <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

                    {importLoading ? (
                      <div>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                        <div style={{ fontSize: 14, color: "var(--muted)" }}>Parsing CSV…</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                          Drop your CSV here
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>
                          or click to browse · .csv and .txt supported
                        </div>
                      </div>
                    )}
                  </div>

                  {importError && (
                    <div style={{
                      marginTop: 12, padding: "12px 16px", borderRadius: "var(--lt-radius)",
                      background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
                      color: "var(--bad)", fontSize: 13,
                    }}>
                      ⚠ {importError}
                    </div>
                  )}

                  <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--panel2)", borderRadius: "var(--lt-radius)", border: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, letterSpacing: "0.06em" }}>HOW TO EXPORT</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                      {[
                        { name: "Binance", path: "Orders → Spot → Trade History → Export" },
                        { name: "Bybit", path: "Assets → Trade History → Export" },
                        { name: "OKX", path: "Trade → Order History → Export CSV" },
                        { name: "Gate.io", path: "My Trades → Export" },
                      ].map(e => (
                        <div key={e.name} style={{ fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{e.name}</div>
                          <div style={{ color: "var(--muted)" }}>{e.path}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* STAGE: PREVIEW */}
              {importStage === "preview" && importResult && (
                <div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                    <StatCard label="PARSED" value={importResult.rowCount} />
                    <StatCard label="SKIPPED" value={importResult.skippedCount} accent={importResult.skippedCount > 0 ? "var(--warn)" : undefined} />
                    <StatCard label="BUYS" value={previewTotal.buys} accent="var(--good)" />
                    <StatCard label="SELLS" value={previewTotal.sells} accent="var(--bad)" />
                    {importResult.dateRange && (
                      <StatCard label="DATE RANGE"
                        value={new Date(importResult.dateRange[0]).toLocaleDateString()}
                        sub={`→ ${new Date(importResult.dateRange[1]).toLocaleDateString()}`} />
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
