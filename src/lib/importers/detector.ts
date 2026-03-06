import { DetectionResult, Exchange } from "./types";

// Known header signatures for spot trade history exports
const SIGNATURES: { exchange: Exchange; exportType: string; required: string[]; rejected?: string[] }[] = [
  // Binance Spot Trade History
  {
    exchange: "binance",
    exportType: "Spot Trade History",
    required: ["Date(UTC)", "Pair", "Side", "Price"],
  },
  // Binance alternate format (older)
  {
    exchange: "binance",
    exportType: "Spot Trade History",
    required: ["Date(UTC)", "Market", "Type", "Price", "Amount", "Total", "Fee", "Fee Coin"],
  },
  // Bybit Spot Trade History (UTA)
  {
    exchange: "bybit",
    exportType: "Spot Trade History",
    required: ["Symbol", "Side", "TradeTime"],
  },
  // Bybit alternate: "Trading Time" variant
  {
    exchange: "bybit",
    exportType: "Spot Trade History",
    required: ["Symbol", "Side", "Trading Time"],
  },
  // OKX Trading History
  {
    exchange: "okx",
    exportType: "Trading History",
    required: ["Instrument ID"],
  },
  // OKX alternate header names
  {
    exchange: "okx",
    exportType: "Trading History",
    required: ["instrument_id"],
  },
  // Gate.io Spot Trade History
  {
    exchange: "gate",
    exportType: "Spot Trade History",
    required: ["pair"],
  },
  // Gate alternate
  {
    exchange: "gate",
    exportType: "Spot Trade History",
    required: ["Pair", "Side"],
  },
];

// Headers that indicate a NON-spot export (reject these)
const REJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /futures|perpetual|perp|swap/i, reason: "Futures/Perpetual exports are not supported in v1" },
  { pattern: /margin/i, reason: "Margin trading exports are not supported in v1" },
  { pattern: /option/i, reason: "Options trading exports are not supported in v1" },
  { pattern: /earn|staking|savings/i, reason: "Earn/Staking exports are not supported in v1" },
  { pattern: /p2p/i, reason: "P2P trading exports are not supported in v1" },
  { pattern: /copy.?trad/i, reason: "Copy trading exports are not supported in v1" },
  { pattern: /deposit|withdrawal|withdraw/i, reason: "Deposit/Withdrawal history is not supported in v1. Only spot trade history is accepted." },
  { pattern: /funding/i, reason: "Funding history is not supported in v1" },
  { pattern: /billing/i, reason: "Billing history is not supported in v1" },
];

export function detectExchange(headers: string[], firstRows: Record<string, string>[]): DetectionResult {
  const headerStr = headers.join(" ");

  // Check for rejection patterns in headers
  for (const { pattern, reason } of REJECTION_PATTERNS) {
    if (pattern.test(headerStr)) {
      return { detected: false, exchange: null, exportType: null, rejected: true, rejectionReason: reason };
    }
  }

  // Also check first few rows for instrument type indicators (OKX puts instType in rows)
  for (const row of firstRows.slice(0, 5)) {
    const vals = Object.values(row).join(" ");
    if (/SWAP|FUTURES|OPTION|MARGIN/i.test(vals)) {
      // Check if it's OKX and has instType column
      if (row["Instrument Type"] && /SWAP|FUTURES|OPTION/i.test(row["Instrument Type"])) {
        return { detected: false, exchange: null, exportType: null, rejected: true, rejectionReason: "Non-spot instrument type detected: " + row["Instrument Type"] };
      }
    }
  }

  // Match signatures
  const headerSet = new Set(headers.map(h => h.trim()));
  for (const sig of SIGNATURES) {
    if (sig.required.every(r => headerSet.has(r))) {
      return { detected: true, exchange: sig.exchange, exportType: sig.exportType, rejected: false, rejectionReason: null };
    }
  }

  return { detected: false, exchange: null, exportType: null, rejected: true, rejectionReason: "No supported exchange format detected. Supported: Binance, Bybit, OKX, Gate.io spot trade history exports." };
}
