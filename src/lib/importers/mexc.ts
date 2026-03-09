import { NormalizedRow, SkippedRow } from "./types";

// MEXC Spot Trade History CSV
// Known headers: Date, Pairs/Symbol, Side/Type, Price, Executed/Amount/Qty, Total, Fee, Fee Coin

export function parseMEXC(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
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

      const dateStr = get(["Date", "Time", "Trade Time", "Filled Time", "Date(UTC)"]);
      const ts = new Date(dateStr).getTime();
      if (!ts || isNaN(ts)) {
        skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r });
        continue;
      }

      const pairRaw = get(["Pairs", "Symbol", "Pair", "Market", "Trading Pair"]);
      const symbol = pairRaw.replace(/[_\-/\s]/g, "").toUpperCase();
      if (!symbol) {
        skipped.push({ line: i + 2, reason: "Missing symbol", raw: r });
        continue;
      }

      const sideRaw = get(["Side", "Type", "Direction"]).toUpperCase();
      const side = sideRaw === "BUY" ? ("buy" as const) : sideRaw === "SELL" ? ("sell" as const) : null;
      if (!side) {
        skipped.push({ line: i + 2, reason: "Invalid side: " + sideRaw, raw: r });
        continue;
      }

      const price = parseNum(get(["Price", "Filled Price", "Avg. Price", "Deal Price"]));
      const qty = parseNum(get(["Executed", "Amount", "Qty", "Filled", "Filled Amount", "Quantity"]));
      const total = parseNum(get(["Total", "Total Amount", "Volume"]));
      const fee = parseNum(get(["Fee", "Trading Fee", "Commission"]));
      const feeAsset = get(["Fee Coin", "Fee Currency", "Fee Asset"]).toUpperCase();

      const tradeId = get(["Trade ID", "TradeId", "Trade No"]);
      const orderId = get(["Order ID", "OrderId", "Order No"]);

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
        exchange: "mexc",
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
