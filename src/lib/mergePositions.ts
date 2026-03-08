// Merge local (localStorage) and worker (API) position data.
// Local-first: local rows always show; worker rows supplement with
// additional assets not present locally.

import type { DerivedPosition } from "./cryptoState";
import type { Position as WorkerPosition } from "@/hooks/usePortfolio";

export interface MergedRow {
  sym: string;
  qty: number;
  cost: number;
  price: number | null;
  mv: number | null;
  unreal: number | null;
  source: "local" | "worker" | "merged";
}

/**
 * Merge local derived rows with worker positions.
 * - Local rows take precedence (they reflect the latest imports).
 * - Worker rows for symbols NOT in local are appended.
 * - If both sources have a symbol, we keep the local row (it's fresher
 *   because imports land there first).
 */
export function mergePositionSources(
  localRows: DerivedPosition[],
  workerPositions: WorkerPosition[],
  workerReady: boolean,
): MergedRow[] {
  const result: MergedRow[] = [];
  const seenSyms = new Set<string>();

  // Add all local rows first
  for (const r of localRows) {
    seenSyms.add(r.sym.toUpperCase());
    result.push({
      sym: r.sym,
      qty: r.qty,
      cost: r.cost,
      price: r.price,
      mv: r.mv,
      unreal: r.unreal,
      source: "local",
    });
  }

  // Add worker-only rows (symbols not already present locally)
  if (workerReady) {
    for (const p of workerPositions) {
      if (seenSyms.has(p.symbol.toUpperCase())) continue;
      seenSyms.add(p.symbol.toUpperCase());
      result.push({
        sym: p.symbol,
        qty: p.qty,
        cost: p.cost,
        price: p.price,
        mv: p.mv,
        unreal: p.pnlAbs,
        source: "worker",
      });
    }
  }

  // Sort by market value descending (nulls last)
  result.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
  return result;
}
