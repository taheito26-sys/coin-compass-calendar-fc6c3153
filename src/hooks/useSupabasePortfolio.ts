import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmtFiat } from "@/lib/cryptoState";

export interface SupabasePosition {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  qty: number;
  cost: number;
  avg: number;
  price: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  mv: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
}

export interface SupabasePortfolioData {
  positions: SupabasePosition[];
  totalMV: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  assetCount: number;
  txCount: number;
  priceAge: string;
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  refresh: () => Promise<void>;
}

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  category: string | null;
}

interface TxRow {
  asset_id: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
}

interface PriceRow {
  asset_id: string;
  price: number;
  price_change_1h: number | null;
  price_change_24h: number | null;
  price_change_7d: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  timestamp: string | null;
}

export function useSupabasePortfolio(): SupabasePortfolioData {
  const [positions, setPositions] = useState<SupabasePosition[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [priceTs, setPriceTs] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthenticated(false);
        setPositions([]);
        setTxCount(0);
        setLoading(false);
        return;
      }
      setAuthenticated(true);

      // Fetch assets, transactions, and prices in parallel
      const [assetsRes, txRes, pricesRes] = await Promise.all([
        supabase.from("assets").select("id, symbol, name, category"),
        supabase.from("transactions").select("asset_id, type, qty, unit_price, fee_amount").eq("user_id", user.id),
        supabase.from("price_cache").select("asset_id, price, price_change_1h, price_change_24h, price_change_7d, market_cap, volume_24h, timestamp"),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (txRes.error) throw txRes.error;
      if (pricesRes.error) throw pricesRes.error;

      const assets: AssetRow[] = assetsRes.data || [];
      const txs: TxRow[] = txRes.data || [];
      const prices: PriceRow[] = pricesRes.data || [];

      setTxCount(txs.length);

      // Build asset lookup
      const assetMap = new Map<string, AssetRow>();
      for (const a of assets) assetMap.set(a.id, a);

      // Build price lookup
      const priceMap = new Map<string, PriceRow>();
      for (const p of prices) {
        priceMap.set(p.asset_id, p);
        if (p.timestamp && (!priceTs || p.timestamp > priceTs)) {
          setPriceTs(p.timestamp);
        }
      }

      // Compute positions from transactions (FIFO-style aggregation)
      const posMap = new Map<string, { qty: number; cost: number }>();
      for (const tx of txs) {
        const current = posMap.get(tx.asset_id) || { qty: 0, cost: 0 };
        const txTotal = tx.qty * tx.unit_price;

        switch (tx.type) {
          case "buy":
          case "transfer_in":
          case "reward":
            current.qty += tx.qty;
            current.cost += txTotal + tx.fee_amount;
            break;
          case "sell":
          case "transfer_out":
            if (current.qty > 0) {
              const avgCost = current.cost / current.qty;
              const soldQty = Math.min(tx.qty, current.qty);
              current.qty -= soldQty;
              current.cost -= avgCost * soldQty;
            }
            break;
          case "fee":
            current.cost += tx.fee_amount;
            break;
        }

        // Clamp to zero
        if (current.qty < 0.00000001) {
          current.qty = 0;
          current.cost = 0;
        }
        posMap.set(tx.asset_id, current);
      }

      // Build final positions
      const result: SupabasePosition[] = [];
      for (const [assetId, pos] of posMap) {
        if (pos.qty <= 0) continue;
        const asset = assetMap.get(assetId);
        if (!asset) continue;
        const priceData = priceMap.get(assetId);
        const price = priceData?.price ?? null;
        const mv = price !== null ? price * pos.qty : null;
        const pnlAbs = mv !== null ? mv - pos.cost : null;
        const pnlPct = pos.cost > 0 && pnlAbs !== null ? (pnlAbs / pos.cost) * 100 : null;

        result.push({
          assetId,
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category || "other",
          qty: pos.qty,
          cost: pos.cost,
          avg: pos.qty > 0 ? pos.cost / pos.qty : 0,
          price,
          priceChange1h: priceData?.price_change_1h ?? null,
          priceChange24h: priceData?.price_change_24h ?? null,
          priceChange7d: priceData?.price_change_7d ?? null,
          marketCap: priceData?.market_cap ?? null,
          volume24h: priceData?.volume_24h ?? null,
          mv,
          pnlAbs,
          pnlPct,
        });
      }

      // Sort by market value descending
      result.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
      setPositions(result);
    } catch (e: any) {
      console.error("Portfolio load error:", e);
      setError(e.message || "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const derived = useMemo(() => {
    const totalMV = positions.reduce((s, p) => s + (p.mv ?? 0), 0);
    const totalCost = positions.reduce((s, p) => s + p.cost, 0);
    const totalPnl = totalMV - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    let priceAge = "—";
    if (priceTs) {
      const ageMs = Date.now() - new Date(priceTs).getTime();
      priceAge = ageMs < 60000 ? Math.round(ageMs / 1000) + "s" : Math.round(ageMs / 60000) + "m";
    }

    return { totalMV, totalCost, totalPnl, totalPnlPct, priceAge };
  }, [positions, priceTs]);

  return {
    positions,
    ...derived,
    assetCount: positions.length,
    txCount,
    loading,
    error,
    authenticated,
    refresh: loadData,
  };
}
