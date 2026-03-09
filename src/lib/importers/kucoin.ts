import { NormalizedRow, SkippedRow } from "./types";

// KuCoin Spot Trade History CSV
// Known headers: tradeCreatedAt, symbol, side, price, size, funds, fee, feeCurrency, orderType
// Alternate: Trade Time, Symbol, Side, Price, Filled, Total, Fee, Fee Currency

export function parseKuCoin(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
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

      const timeStr = get(["tradeCreatedAt", "Trade Time", "Time", "Date", "Created At", "orderCreatedAt"]);
      let ts: number;
      const numTime = Number(timeStr);
      if (numTime > 1e12) ts = numTime;
      else if (numTime > 1e9) ts = numTime * 1000;
      else ts = new Date(timeStr).getTime();
      if (!ts || isNaN(ts)) {
        skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r });
        continue;
      }

      const pairRaw = get(["symbol", "Symbol", "Pair", "Market", "Trading Pair"]);
      const symbol = pairRaw.replace(/[_\-/\s]/g, "").toUpperCase();
      if (!symbol) {
        skipped.push({ line: i + 2, reason: "Missing symbol", raw: r });
        continue;
      }

      const sideRaw = get(["side", "Side", "Direction", "Type"]).toUpperCase();
      const side = sideRaw === "BUY" ? ("buy" as const) : sideRaw === "SELL" ? ("sell" as const) : null;
      if (!side) {
        skipped.push({ line: i + 2, reason: "Invalid side: " + sideRaw, raw: r });
        continue;
      }

      const price = parseNum(get(["price", "Price", "Deal Price", "Filled Price"]));
      const qty = parseNum(get(["size", "Size", "Filled", "Amount", "Qty", "Quantity"]));
      const total = parseNum(get(["funds", "Funds", "Total", "Volume"]));
      const fee = parseNum(get(["fee", "Fee", "Trading Fee"]));
      const feeAsset = get(["feeCurrency", "Fee Currency", "Fee Coin", "Fee Asset"]).toUpperCase();

      const tradeId = get(["tradeId", "Trade ID", "TradeId"]);
      const orderId = get(["orderId", "Order ID", "Order Id", "OrderId"]);

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
        exchange: "kucoin",
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
