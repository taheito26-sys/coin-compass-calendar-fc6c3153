import { NormalizedRow, SkippedRow } from "./types";

// Gate.io Spot Trade History CSV
// Known headers: 
// No, Pair, Type/Side, Order Price, Amount, Total, Fee, Fee Coin, Time, Trade ID
// Alternate: pair, side, price, amount, total, fee, fee_coin, create_time, trade_id
// Alternate: no, pair, type, order_price, amount, total, fee, fee_coin, time

export function parseGate(rows: Record<string, string>[]): { parsed: NormalizedRow[]; skipped: SkippedRow[] } {
  const parsed: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const get = (keys: string[]) => {
        for (const k of keys) { if (r[k] !== undefined && r[k] !== "") return r[k]; }
        return "";
      };

      const pairRaw = get(["Pair", "pair", "Currency Pair", "currency_pair", "Market"]);
      const symbol = pairRaw.replace(/[_\-/\s]/g, "").toUpperCase();
      if (!symbol) { skipped.push({ line: i + 2, reason: "Missing pair", raw: r }); continue; }

      const timeStr = get(["Time", "time", "Create Time", "create_time", "Trade Time", "trade_time"]);
      let ts: number;
      const numTime = Number(timeStr);
      if (numTime > 1e12) ts = numTime;
      else if (numTime > 1e9) ts = numTime * 1000;
      else ts = new Date(timeStr).getTime();
      if (!ts || isNaN(ts)) { skipped.push({ line: i + 2, reason: "Invalid timestamp", raw: r }); continue; }

      const sideRaw = get(["Side", "side", "Type", "type"]).toLowerCase();
      const side = sideRaw === "buy" ? "buy" as const : sideRaw === "sell" ? "sell" as const : null;
      if (!side) { skipped.push({ line: i + 2, reason: "Invalid side: " + sideRaw, raw: r }); continue; }

      const price = parseNum(get(["Order Price", "order_price", "Price", "price"]));
      const qty = parseNum(get(["Amount", "amount", "Quantity", "quantity", "Filled"]));
      const total = parseNum(get(["Total", "total"]));
      const fee = parseNum(get(["Fee", "fee", "Trading Fee"]));
      const feeAsset = get(["Fee Coin", "fee_coin", "Fee Currency", "fee_currency"]).toUpperCase();

      if (qty <= 0) { skipped.push({ line: i + 2, reason: "Zero or negative qty", raw: r }); continue; }
      if (price < 0) { skipped.push({ line: i + 2, reason: "Negative price", raw: r }); continue; }

      parsed.push({
        timestamp: ts,
        exchange: "gate",
        symbol,
        side,
        qty,
        unitPrice: price,
        grossValue: price > 0 ? qty * price : Math.abs(total),
        feeAmount: Math.abs(fee),
        feeAsset,
        externalId: get(["Trade ID", "trade_id", "TradeId", "No", "no"]),
        note: "",
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
