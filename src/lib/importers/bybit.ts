import { NormalizedRow, SkippedRow } from "./types";

// Bybit Spot Trade History (UTA) CSV
// Known headers variants:
// Symbol, TradeTime, Side, TradePrice, ExecQty, ExecFee, FeeAsset, OrderId, TradeId
// Symbol, Trading Time, Side, Order Price, Filled, Avg. Filled Price, Fee, Fee Asset, Order ID, Trade ID

export function parseBybit(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
  const parsed: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dateStr = r["TradeTime"] || r["Trading Time"] || r["Trade Time"] || r["Create Time"] || "";
      const ts = new Date(dateStr).getTime();
      if (!ts || isNaN(ts)) {
        skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r });
        continue;
      }

      const symbol = (r["Symbol"] || r["Contracts"] || "").replace(/[_\-/\s]/g, "").toUpperCase();
      if (!symbol) {
        skipped.push({ line: i + 2, reason: "Missing symbol", raw: r });
        continue;
      }

      // Reject non-spot
      const cat = (r["Category"] || r["Type"] || "").toUpperCase();
      if (cat && !["SPOT", ""].includes(cat)) {
        skipped.push({ line: i + 2, reason: "Non-spot record: " + cat, raw: r });
        continue;
      }

      const sideRaw = (r["Side"] || "").toUpperCase();
      const side = sideRaw === "BUY" ? ("buy" as const) : sideRaw === "SELL" ? ("sell" as const) : null;
      if (!side) {
        skipped.push({ line: i + 2, reason: "Invalid side: " + sideRaw, raw: r });
        continue;
      }

      const price = parseNum(r["TradePrice"] || r["Avg. Filled Price"] || r["Avg Filled Price"] || r["Order Price"] || "0");
      const qty = parseNum(r["ExecQty"] || r["Filled"] || r["Qty"] || "0");
      const fee = parseNum(r["ExecFee"] || r["Fee"] || r["Trading Fee"] || "0");
      const feeAsset = (r["FeeAsset"] || r["Fee Asset"] || r["Fee Currency"] || "").toUpperCase();

      const tradeId = String(r["TradeId"] || r["Trade ID"] || "");
      const orderId = String(r["OrderId"] || r["Order ID"] || "");

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
        exchange: "bybit",
        symbol,
        side,
        qty,
        unitPrice: price,
        grossValue: qty * price,
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
