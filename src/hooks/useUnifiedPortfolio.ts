/**
 * useUnifiedPortfolio.ts
 *
 * Single hook for all portfolio data across Dashboard, Assets, and Drilldown.
 * Reads from useCrypto().state.txs as the ONLY source of truth.
 * Applies live prices uniformly.
 */

import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import { derivePortfolio, type PortfolioSummary, type DerivedPosition } from "@/lib/derivePortfolio";

export type { PortfolioSummary, DerivedPosition };

export function useUnifiedPortfolio(): PortfolioSummary & {
  base: string;
  method: string;
  getPosition: (sym: string) => DerivedPosition | undefined;
} {
  const { state } = useCrypto();
  const { getPrice: getLivePrice } = useLivePrices();

  // Build a unified price lookup: live prices first, fallback to local cached prices
  const priceGetter = useMemo(() => {
    return (sym: string): number | null => {
      const live = getLivePrice(sym);
      if (live?.current_price != null) return live.current_price;
      // Fallback to locally cached prices
      const cached = state.prices[sym.toUpperCase()];
      if (Number.isFinite(cached)) return cached;
      return null;
    };
  }, [getLivePrice, state.prices]);

  const summary = useMemo(() => {
    return derivePortfolio(state.txs, priceGetter);
  }, [state.txs, priceGetter]);

  const positionMap = useMemo(() => {
    const map = new Map<string, DerivedPosition>();
    for (const p of summary.positions) {
      map.set(p.sym.toUpperCase(), p);
    }
    return map;
  }, [summary.positions]);

  return {
    ...summary,
    base: state.base || "USD",
    method: state.method || "FIFO",
    getPosition: (sym: string) => positionMap.get(sym.toUpperCase()),
  };
}
