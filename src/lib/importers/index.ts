// ── Import orchestrator (v2) ──────────────────────────────────────────
import { parseCSV, hashFile, hashString } from "./csv";
import { detectExchange } from "./detector";
import { parseBinance } from "./binance";
import { parseBybit } from "./bybit";
import { parseOKX } from "./okx";
import { parseGate } from "./gate";
import { parseMEXC } from "./mexc";
import { parseKuCoin } from "./kucoin";
import { extractBaseFromPair, normalizeSymbol } from "@/lib/symbolAliases";
import type {
  CanonicalTransactionRow,
  DetectionResult,
  Exchange,
  ImportFile,
  ImportPreviewRow,
  ImportRowStatus,
  NormalizedRow,
  ParseResult,
  SkippedRow,
} from "./types";

const ADAPTERS = {
  binance: parseBinance,
  bybit: parseBybit,
  okx: parseOKX,
  gate: parseGate,
  mexc: parseMEXC,
  kucoin: parseKuCoin,
} as const;

export type { ParseResult, NormalizedRow, ImportFile };
export type { Exchange, DetectionResult, SkippedRow, ImportPreviewRow, ImportRowStatus } from "./types";

function exportTypeKey(exportType: string): string {
  return exportType.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function guessQuoteFromPair(pair: string, base: string): string {
  const p = pair.toUpperCase();
  const b = base.toUpperCase();
  if (p === b) return "";
  return p.startsWith(b) ? p.slice(b.length) : "";
}

function toCanonical(row: NormalizedRow, exportType: string): CanonicalTransactionRow {
  const assetSymbol = normalizeSymbol(row.symbol);
  const baseAsset = extractBaseFromPair(assetSymbol);
  const quoteAsset = guessQuoteFromPair(assetSymbol, baseAsset);

  return {
    sourceExchange: row.exchange,
    sourceExportType: exportType,
    sourceRowIndex: row.sourceRowIndex,

    timestamp: row.timestamp,
    type: "trade",
    side: row.side,

    assetSymbol,
    baseAsset: normalizeSymbol(baseAsset),
    quoteAsset: normalizeSymbol(quoteAsset),

    qty: row.qty,
    price: row.unitPrice,
    grossValue: row.grossValue,

    feeAmount: row.feeAmount,
    feeAsset: normalizeSymbol(row.feeAsset || ""),

    orderId: row.orderId || "",
    tradeId: row.tradeId || "",
    txHash: row.txHash || "",

    rawRow: row.raw,
  };
}

async function fingerprintForRow(c: CanonicalTransactionRow): Promise<{ fingerprint: string; fingerprintHash: string; nativeId: string | null }> {
  const nativeId = (c.tradeId || c.orderId || c.txHash || "").trim() || null;

  // Priority fingerprint
  const fp = nativeId
    ? `${c.sourceExchange}:${exportTypeKey(c.sourceExportType)}:native:${nativeId}`
    : `${c.sourceExchange}:${exportTypeKey(c.sourceExportType)}:composite:${c.timestamp}:${c.type}:${c.side}:${c.assetSymbol}:${c.baseAsset}:${c.quoteAsset}:${c.qty}:${c.price}:${c.feeAmount}:${c.feeAsset}`;

  const fingerprintHash = await hashString(fp);
  return { fingerprint: fp, fingerprintHash, nativeId };
}

function validateCanonical(c: CanonicalTransactionRow): { status: ImportRowStatus; message: string | null } {
  if (!c.timestamp || !Number.isFinite(c.timestamp)) return { status: "invalid", message: "Invalid timestamp" };
  if (!c.assetSymbol) return { status: "invalid", message: "Missing asset / pair" };
  if (!Number.isFinite(c.qty) || !(c.qty > 0)) return { status: "invalid", message: "Invalid quantity" };
  if (!Number.isFinite(c.price) || c.price < 0) return { status: "invalid", message: "Invalid price" };

  // Warning-level validations (still importable)
  if (c.feeAmount < 0) return { status: "warning", message: "Negative fee (will be normalized)" };
  if (c.feeAmount > 0 && !c.feeAsset) return { status: "warning", message: "Fee present but fee asset missing" };

  return { status: "new", message: null };
}

export async function importCSV(
  fileContent: string,
  fileName: string,
  opts?: { forceExchange?: Exchange },
): Promise<ParseResult> {
  const { headers, rows } = parseCSV(fileContent);
  const warnings: string[] = [];

  if (headers.length === 0 || rows.length === 0) {
    return {
      detection: {
        detected: false,
        exchange: null,
        exportType: null,
        confidence: 0,
        candidates: [],
        rejected: true,
        rejectionReason: "File is empty or has no data rows",
      },
      exchange: "binance",
      exportType: "Unknown",
      rows: [],
      warnings: ["File is empty or has no data rows"],
      dateRange: null,
      rowCount: 0,
      skippedCount: 0,
    };
  }

  const detection = detectExchange(headers, rows.slice(0, 10));

  const chosenExchange: Exchange | null = opts?.forceExchange ?? detection.exchange;
  const exportType = detection.exportType || "Spot Trade History";

  if (detection.rejected || !chosenExchange) {
    return {
      detection,
      exchange: "binance",
      exportType: detection.exportType || "Unknown",
      rows: [],
      warnings: [detection.rejectionReason || "Could not detect exchange format"],
      dateRange: null,
      rowCount: 0,
      skippedCount: 0,
    };
  }

  const adapter = ADAPTERS[chosenExchange];
  const { parsed: rawParsed, skipped } = adapter(rows);

  // Convert skipped rows to invalid preview rows
  const invalidRows: ImportPreviewRow[] = skipped.map((s) => {
    const canonical: CanonicalTransactionRow = {
      sourceExchange: chosenExchange,
      sourceExportType: exportType,
      sourceRowIndex: Math.max(0, s.line - 2),

      timestamp: 0,
      type: "trade",
      side: "buy",

      assetSymbol: "",
      baseAsset: "",
      quoteAsset: "",

      qty: 0,
      price: 0,
      grossValue: 0,

      feeAmount: 0,
      feeAsset: "",

      orderId: "",
      tradeId: "",
      txHash: "",

      rawRow: s.raw,
    };

    return {
      ...canonical,
      fingerprint: "",
      fingerprintHash: "",
      nativeId: null,
      status: "invalid",
      message: s.reason,
    };
  });

  // Canonicalize parsed rows + compute fingerprints
  const canonicalRows: ImportPreviewRow[] = [];
  for (const row of rawParsed) {
    const canonical = toCanonical(row, exportType);
    const validation = validateCanonical(canonical);

    const { fingerprint, fingerprintHash, nativeId } = await fingerprintForRow(canonical);

    canonicalRows.push({
      ...canonical,
      fingerprint,
      fingerprintHash,
      nativeId,
      status: validation.status,
      message: validation.message,
    });
  }

  // Duplicate-in-file detection (never silently skip)
  const seen = new Set<string>();
  for (const r of canonicalRows) {
    if (!r.fingerprintHash) continue;
    if (seen.has(r.fingerprintHash)) {
      r.status = r.status === "invalid" ? "invalid" : "warning";
      r.message = r.message ? `${r.message} · Duplicate row in file` : "Duplicate row in file";
    } else {
      seen.add(r.fingerprintHash);
    }
  }

  const allRows = [...canonicalRows, ...invalidRows].sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);

  // Date range from valid timestamps
  const validTimestamps = allRows.map((r) => r.timestamp).filter((ts) => Number.isFinite(ts) && ts > 0);
  const dateRange: [number, number] | null = validTimestamps.length
    ? [Math.min(...validTimestamps), Math.max(...validTimestamps)]
    : null;

  const skippedCount = allRows.filter((r) => r.status === "invalid").length;
  if (skippedCount > 0) warnings.push(`${skippedCount} row(s) invalid`);
  if (detection.confidence > 0 && detection.confidence < 0.9) warnings.push("Low confidence exchange detection — confirm before saving");

  return {
    detection,
    exchange: chosenExchange,
    exportType,
    rows: allRows,
    warnings,
    dateRange,
    rowCount: allRows.length,
    skippedCount,
  };
}

export interface ImportLookupPayload {
  existingFingerprints: Record<string, { native_id: string | null; canonical_json: string | null }>;
  existingByNativeId: Record<string, { fingerprint_hash: string; canonical_json: string | null }>;
}

/** Apply backend lookup results to mark rows as alreadyImported/conflict (keeps invalid/warning). */
export function applyLookup(rows: ImportPreviewRow[], lookup: ImportLookupPayload | null): ImportPreviewRow[] {
  if (!lookup) return rows;

  return rows.map((r) => {
    if (r.status === "invalid") return r;

    if (r.fingerprintHash && lookup.existingFingerprints[r.fingerprintHash]) {
      return { ...r, status: "alreadyImported", message: r.message ? `${r.message} · Already imported` : "Already imported" };
    }

    if (r.nativeId && lookup.existingByNativeId[r.nativeId]) {
      return { ...r, status: "conflict", message: r.message ? `${r.message} · Conflict: same native ID differs` : "Conflict: same native ID differs" };
    }

    return r;
  });
}

export { hashFile };
