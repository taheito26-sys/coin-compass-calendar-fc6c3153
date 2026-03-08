/**
 * useUnifiedPortfolio.ts
 *
 * Single hook for all portfolio data across Dashboard, Assets, and Drilldown.
 * Reads from useCrypto().state.txs as the ONLY source of truth.
 * Applies live prices uniformly.
 */

import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { derivePortfolio, type PortfolioSummary, type DerivedPosition } from "@/lib/derivePortfolio";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";

export type { PortfolioSummary, DerivedPosition };

export function useUnifiedPortfolio(): PortfolioSummary & {
  base: string;
  method: string;
  getPosition: (sym: string) => DerivedPosition | undefined;
} {
  const { state } = useCrypto();
  const priceGetter = usePortfolioPriceGetter();

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
