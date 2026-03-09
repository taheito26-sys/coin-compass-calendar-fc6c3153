// ── Import system types ──────────────────────────────────────────
// v1A: Spot trade history only. No deposits, withdrawals, transfers.
// No futures, margin, options, earn, P2P, copy trading.

export type Exchange = "binance" | "bybit" | "okx" | "gate" | "mexc" | "kucoin";

export interface NormalizedRow {
  timestamp: number;        // unix ms
  exchange: Exchange;
  symbol: string;           // e.g. "BTCUSDT"
  side: "buy" | "sell";
  qty: number;
  unitPrice: number;
  grossValue: number;       // qty * unitPrice
  feeAmount: number;
  feeAsset: string;
  externalId: string;       // trade ID from exchange
  note: string;
  raw: Record<string, string>; // original CSV row
}

export interface ParseResult {
  exchange: Exchange;
  exportType: string;       // e.g. "Spot Trade History"
  rows: NormalizedRow[];
  skipped: SkippedRow[];
  warnings: string[];
  dateRange: [number, number] | null; // [earliest, latest] unix ms
  rowCount: number;
  skippedCount: number;
}

export interface SkippedRow {
  line: number;
  reason: string;
  raw: Record<string, string>;
}

export interface DetectionResult {
  detected: boolean;
  exchange: Exchange | null;
  exportType: string | null;
  rejected: boolean;
  rejectionReason: string | null;
}

export interface ImportFile {
  name: string;
  hash: string;
  importedAt: number;
  exchange: Exchange;
  exportType: string;
  rowCount: number;
}
