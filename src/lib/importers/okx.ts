import { NormalizedRow, SkippedRow } from "./types";

// OKX Trading History CSV
// Known headers:
// Instrument ID, Order ID, Trade ID, Fill time, Fill price, Fill size, Fee, Fee currency, Side, PnL, ...
// Alternate: instrument_id, order_id, trade_id, fill_time, fill_price, fill_size, fee, fee_currency, side

export function parseOKX(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
  const parsed: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const get = (keys: string[]) => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== "") return r[k];
        }
        return "";
      };

      // Reject non-SPOT
      const instType = get(["Instrument Type", "instrument_type", "instType"]).toUpperCase();
      if (instType && instType !== "SPOT") {
        skipped.push({ line: i + 2, reason: "Non-spot instrument: " + instType, raw: r });
        continue;
      }

      const instId = get(["Instrument ID", "instrument_id", "instId"]);
      const symbol = instId.replace(/[_\-/\s]/g, "").toUpperCase();
      if (!symbol) {
        skipped.push({ line: i + 2, reason: "Missing instrument", raw: r });
        continue;
      }

      const timeStr = get(["Fill time", "fill_time", "Trade time", "trade_time", "Filled Time"]);
      let ts: number;
      const numTime = Number(timeStr);
      if (numTime > 1e12) ts = numTime;
      else if (numTime > 1e9) ts = numTime * 1000;
      else ts = new Date(timeStr).getTime();
      if (!ts || isNaN(ts)) {
        skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r });
        continue;
      }

      const sideRaw = get(["Side", "side"]).toLowerCase();
      const side = sideRaw === "buy" ? ("buy" as const) : sideRaw === "sell" ? ("sell" as const) : null;
      if (!side) {
        skipped.push({ line: i + 2, reason: "Invalid side: " + sideRaw, raw: r });
        continue;
      }

      const price = parseNum(get(["Fill price", "fill_price", "Price", "price"]));
      const qty = parseNum(get(["Fill size", "fill_size", "Size", "size", "Filled Qty"]));
      const fee = parseNum(get(["Fee", "fee"]));
      const feeAsset = get(["Fee currency", "fee_currency", "Fee Currency"]).toUpperCase();

      const tradeId = get(["Trade ID", "trade_id", "TradeId"]);
      const orderId = get(["Order ID", "order_id", "OrderId"]);

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
        exchange: "okx",
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
