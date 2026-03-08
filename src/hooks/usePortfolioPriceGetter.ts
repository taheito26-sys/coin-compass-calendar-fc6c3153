import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";

export function usePortfolioPriceGetter() {
  const { state } = useCrypto();
  const { getPrice } = useLivePrices();

  return useMemo(() => {
    return (sym: string): number | null => {
      const live = getPrice(sym);
      if (live?.current_price != null) return live.current_price;

      const cached = state.prices[sym.toUpperCase()];
      if (Number.isFinite(cached)) return cached;

      return null;
    };
  }, [getPrice, state.prices]);
}
