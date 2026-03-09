import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";

export function usePortfolioPriceGetter() {
  const { state } = useCrypto();
  const { getPrice, spotPrices } = useLivePrices();

  return useMemo(() => {
    return (sym: string): number | null => {
      const key = sym.toUpperCase();

      // 1. Binance WS/REST spot price (most real-time)
      const spot = spotPrices[key];
      if (spot?.price != null && spot.price > 0) return spot.price;

      // 2. CoinGecko live data
      const live = getPrice(key);
      if (live?.current_price != null) return live.current_price;

      // 3. Cached state prices
      const cached = state.prices[key];
      if (Number.isFinite(cached)) return cached;

      return null;
    };
  }, [getPrice, spotPrices, state.prices]);
}
