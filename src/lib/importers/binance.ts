import { NormalizedRow, SkippedRow } from "./types";

// Binance Spot Trade History CSV
// Known headers: Date(UTC), Pair, Side, Price, Executed, Amount, Fee, Fee Coin
// Alternate:     Date(UTC), Market, Type, Price, Amount, Total, Fee, Fee Coin

export function parseBinance(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
  const parsed: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dateStr = r["Date(UTC)"] || r["Date"] || "";
      const ts = new Date(dateStr).getTime();
      if (!ts || isNaN(ts)) {
        skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r });
        continue;
      }

      const symbol = (r["Pair"] || r["Market"] || "").replace(/[_\-/\s]/g, "").toUpperCase();
      if (!symbol) {
        skipped.push({ line: i + 2, reason: "Missing symbol", raw: r });
        continue;
      }

      const sideRaw = (r["Side"] || r["Type"] || "").toUpperCase();
      const side = sideRaw === "BUY" ? ("buy" as const) : sideRaw === "SELL" ? ("sell" as const) : null;
      if (!side) {
        skipped.push({ line: i + 2, reason: "Invalid side: " + sideRaw, raw: r });
        continue;
      }

      // Executed = filled qty; Amount = total cost in quote
      const qty = parseNum(r["Executed"] || r["Amount"] || r["Qty"] || "0");
      const price = parseNum(r["Price"] || "0");
      const total = parseNum(r["Amount"] || r["Total"] || "0");
      const fee = parseNum(r["Fee"] || "0");
      const feeAsset = (r["Fee Coin"] || r["Fee Asset"] || "").toUpperCase();

      const tradeId = String(r["Trade ID"] || r["TradeId"] || "");
      const orderId = String(r["Order ID"] || r["OrderId"] || "");

      if (qty <= 0) {
        skipped.push({ line: i + 2, reason: "Zero or negative qty", raw: r });
        continue;
      }
      if (price < 0) {
        skipped.push({ line: i + 2, reason: "Negative price", raw: r });
        continue;
      }

      parsed.push({
        sourceRowIndex: i,
        timestamp: ts,
        exchange: "binance",
        symbol,
        side,
        qty,
        unitPrice: price,
        grossValue: price > 0 ? qty * price : Math.abs(total),
        feeAmount: Math.abs(fee),
        feeAsset,
        tradeId: tradeId || "",
        orderId: orderId || "",
        txHash: "",
        externalId: tradeId || orderId || "",
        raw: r,
      });
    } catch {
      skipped.push({ line: i + 2, reason: "Parse error", raw: r });
    }
  }
  return { parsed, skipped };
}

function parseNum(v: string): number {
  const n = parseFloat(v.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
