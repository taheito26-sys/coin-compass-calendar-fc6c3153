import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setAuthTokenProvider, fetchAssets, fetchTransactions, fetchPrices, isWorkerAvailable, ApiAsset, ApiTransaction, ApiPriceEntry } from "@/lib/api";

export interface Position {
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

export interface PortfolioData {
  positions: Position[];
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
  workerOnline: boolean;
  refresh: () => Promise<void>;
}

function buildPositions(
  assets: ApiAsset[],
  txs: ApiTransaction[],
  prices: Record<string, ApiPriceEntry>
): Position[] {
  const assetMap = new Map<string, ApiAsset>();
  for (const a of assets) assetMap.set(a.id, a);

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

    if (current.qty < 0.00000001) {
      current.qty = 0;
      current.cost = 0;
    }
    posMap.set(tx.asset_id, current);
  }

  const result: Position[] = [];
  for (const [assetId, pos] of posMap) {
    if (pos.qty <= 0) continue;
    const asset = assetMap.get(assetId);
    if (!asset) continue;
    const priceData = prices[assetId];
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
      priceChange1h: priceData?.change_1h ?? null,
      priceChange24h: priceData?.change_24h ?? null,
      priceChange7d: priceData?.change_7d ?? null,
      marketCap: priceData?.market_cap ?? null,
      volume24h: priceData?.volume_24h ?? null,
      mv,
      pnlAbs,
      pnlPct,
    });
  }

  result.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
  return result;
}

const PRICE_POLL_MS = 120_000;

export function usePortfolio(): PortfolioData {
  const { isSignedIn, getToken } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceTs, setPriceTs] = useState(0);
  const [workerOnline, setWorkerOnline] = useState(false);

  const assetsRef = useRef<ApiAsset[]>([]);
  const txsRef = useRef<ApiTransaction[]>([]);

  // Wire up Clerk token provider
  useEffect(() => {
    setAuthTokenProvider(() => getToken());
  }, [getToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [assets, txs, priceData, online] = await Promise.all([
        fetchAssets(),
        fetchTransactions(),
        fetchPrices(),
        isWorkerAvailable(),
      ]);

      assetsRef.current = assets;
      txsRef.current = txs;
      setWorkerOnline(online);
      setTxCount(txs.length);
      setPriceTs(priceData.ts);

      const result = buildPositions(assets, txs, priceData.prices);
      setPositions(result);
    } catch (e: any) {
      console.error("Portfolio load error:", e);
      setError(e.message || "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    if (assetsRef.current.length === 0) return;
    try {
      const priceData = await fetchPrices();
      setPriceTs(priceData.ts);
      const result = buildPositions(assetsRef.current, txsRef.current, priceData.prices);
      setPositions(result);
    } catch (e: any) {
      console.warn("Price refresh failed:", e.message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const id = window.setInterval(refreshPrices, PRICE_POLL_MS);
    return () => clearInterval(id);
  }, [refreshPrices]);

  const derived = useMemo(() => {
    const totalMV = positions.reduce((s, p) => s + (p.mv ?? 0), 0);
    const totalCost = positions.reduce((s, p) => s + p.cost, 0);
    const totalPnl = totalMV - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    let priceAge = "—";
    if (priceTs > 0) {
      const ageMs = Date.now() - priceTs;
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
    authenticated: !!isSignedIn,
    workerOnline,
    refresh: loadData,
  };
}
