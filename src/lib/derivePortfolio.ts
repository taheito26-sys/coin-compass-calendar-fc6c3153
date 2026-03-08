/**
 * derivePortfolio.ts
 *
 * Single source of truth for portfolio derivation.
 * Takes raw transactions + a price lookup → produces positions, lots, and totals.
 * Every page (Dashboard, Assets, Calendar, Drilldown) should use this.
 */

import type { CryptoTx } from "./cryptoState";

export interface DerivedLot {
  id: string;
  ts: number;
  asset: string;
  qty: number;
  qtyRem: number;
  unitCost: number;
  tag: string;
}

export interface DerivedPosition {
  sym: string;
  qty: number;
  cost: number;
  price: number | null;
  mv: number | null;
  unreal: number | null;
  avg: number;
  lots: DerivedLot[];
  realizedPnl: number;
  txCount: number;
}

export interface PortfolioSummary {
  positions: DerivedPosition[];
  totalMV: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  realizedPnl: number;
  assetCount: number;
  txCount: number;
}

/**
 * Derive full portfolio state from raw transactions.
 * Uses FIFO lot matching for sells.
 *
 * @param txs - All transactions, in any order (will be sorted internally)
 * @param getPrice - Function returning current price for a symbol, or null
 */
export function derivePortfolio(
  txs: CryptoTx[],
  getPrice: (sym: string) => number | null,
): PortfolioSummary {
  // Sort chronologically for FIFO
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);

  // Per-asset lot tracking
  const lotsMap = new Map<string, DerivedLot[]>();
  const realizedMap = new Map<string, number>();
  const txCountMap = new Map<string, number>();

  let lotCounter = 0;

  for (const tx of sorted) {
    const sym = tx.asset.toUpperCase();
    if (!sym) continue;

    txCountMap.set(sym, (txCountMap.get(sym) || 0) + 1);

    if (!lotsMap.has(sym)) lotsMap.set(sym, []);
    const lots = lotsMap.get(sym)!;

    const q = Math.abs(tx.qty);
    if (q <= 0) continue;

    if (tx.type === "buy" || tx.type === "reward" || tx.type === "transfer_in") {
      const totalCost = tx.type === "buy" ? q * tx.price + (tx.fee || 0) : 0;
      const unitCost = q > 0 ? totalCost / q : 0;
      lots.push({
        id: `lot_${++lotCounter}`,
        ts: tx.ts,
        asset: sym,
        qty: q,
        qtyRem: q,
        unitCost,
        tag: tx.type,
      });
    } else if (tx.type === "sell" || tx.type === "transfer_out") {
      let rem = q;
      let costConsumed = 0;
      // FIFO: consume oldest lots first
      for (const lot of lots) {
        if (rem <= 0) break;
        if (lot.qtyRem <= 0) continue;
        const take = Math.min(lot.qtyRem, rem);
        costConsumed += take * lot.unitCost;
        lot.qtyRem -= take;
        rem -= take;
      }
      if (tx.type === "sell") {
        const proceeds = q * tx.price - (tx.fee || 0);
        const realized = proceeds - costConsumed;
        realizedMap.set(sym, (realizedMap.get(sym) || 0) + realized);
      }
    }
  }

  // Build positions from remaining lots
  const positions: DerivedPosition[] = [];

  for (const [sym, lots] of lotsMap) {
    const openLots = lots.filter(l => l.qtyRem > 1e-10);
    const totalQty = openLots.reduce((s, l) => s + l.qtyRem, 0);
    const totalCost = openLots.reduce((s, l) => s + l.qtyRem * l.unitCost, 0);

    if (totalQty <= 1e-10) continue;

    const price = getPrice(sym);
    const mv = price !== null ? price * totalQty : null;
    const unreal = mv !== null ? mv - totalCost : null;
    const avg = totalQty > 0 ? totalCost / totalQty : 0;

    positions.push({
      sym,
      qty: totalQty,
      cost: totalCost,
      price,
      mv,
      unreal,
      avg,
      lots: openLots,
      realizedPnl: realizedMap.get(sym) || 0,
      txCount: txCountMap.get(sym) || 0,
    });
  }

  // Sort by market value descending (nulls last)
  positions.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));

  const totalMV = positions.reduce((s, p) => s + (p.mv ?? 0), 0);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const realizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0);
  const txCount = sorted.length;

  return {
    positions,
    totalMV,
    totalCost,
    totalPnl,
    totalPnlPct,
    realizedPnl,
    assetCount: positions.length,
    txCount,
  };
}
