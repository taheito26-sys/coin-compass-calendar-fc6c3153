// ── Import orchestrator ──────────────────────────────────────────
import { parseCSV, hashFile } from "./csv";
import { detectExchange } from "./detector";
import { parseBinance } from "./binance";
import { parseBybit } from "./bybit";
import { parseOKX } from "./okx";
import { parseGate } from "./gate";
import { extractBaseFromPair, normalizeSymbol } from "@/lib/symbolAliases";
import type { ParseResult, NormalizedRow, ImportFile } from "./types";

const ADAPTERS = {
  binance: parseBinance,
  bybit: parseBybit,
  okx: parseOKX,
  gate: parseGate,
} as const;

export type { ParseResult, NormalizedRow, ImportFile };
export type { Exchange, DetectionResult, SkippedRow } from "./types";

export async function importCSV(fileContent: string, fileName: string): Promise<ParseResult> {
  const { headers, rows } = parseCSV(fileContent);
  const warnings: string[] = [];

  if (headers.length === 0 || rows.length === 0) {
    return { exchange: "binance", exportType: "Unknown", rows: [], skipped: [], warnings: ["File is empty or has no data rows"], dateRange: null, rowCount: 0, skippedCount: 0 };
  }

  // Detect exchange
  const detection = detectExchange(headers, rows.slice(0, 10));

  if (detection.rejected || !detection.detected || !detection.exchange) {
    return {
      exchange: "binance",
      exportType: detection.exportType || "Unknown",
      rows: [],
      skipped: [],
      warnings: [detection.rejectionReason || "Could not detect exchange format"],
      dateRange: null,
      rowCount: 0,
      skippedCount: 0,
    };
  }

  // Parse with exchange-specific adapter
  const adapter = ADAPTERS[detection.exchange];
  const { parsed: rawParsed, skipped } = adapter(rows);

  // Normalize symbols through alias map
  const parsed = rawParsed.map(row => ({
    ...row,
    symbol: normalizeSymbol(row.symbol),
  }));

  // Deduplicate by externalId, or by composite fingerprint
  const seen = new Set<string>();
  const deduped: NormalizedRow[] = [];
  for (const row of parsed) {
    const key = row.externalId
      ? `${row.exchange}:${row.externalId}`
      : `${row.exchange}:${row.timestamp}:${row.symbol}:${row.side}:${row.qty}:${row.unitPrice}`;
    if (seen.has(key)) {
      warnings.push(`Duplicate row skipped: ${key}`);
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  // Date range
  let dateRange: [number, number] | null = null;
  if (deduped.length > 0) {
    const timestamps = deduped.map(r => r.timestamp);
    dateRange = [Math.min(...timestamps), Math.max(...timestamps)];
  }

  if (skipped.length > 0) {
    warnings.push(`${skipped.length} row(s) skipped during parsing`);
  }

  return {
    exchange: detection.exchange,
    exportType: detection.exportType || "Spot Trade History",
    rows: deduped,
    skipped,
    warnings,
    dateRange,
    rowCount: deduped.length,
    skippedCount: skipped.length,
  };
}

export { hashFile };
