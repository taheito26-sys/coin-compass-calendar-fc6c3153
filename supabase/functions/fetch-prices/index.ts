import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BinanceTickerResponse {
  symbol: string;
  price: string;
}

interface Binance24hResponse {
  symbol: string;
  priceChangePercent: string;
  volume: string;
}

async function fetchBinancePrices(symbols: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  try {
    const symbolsParam = symbols.map(s => `"${s}"`).join(",");
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=[${symbolsParam}]`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Binance price API error: ${response.status}`);
    const data: BinanceTickerResponse[] = await response.json();
    for (const ticker of data) {
      const price = parseFloat(ticker.price);
      if (!isNaN(price)) priceMap.set(ticker.symbol, price);
    }
  } catch (error) {
    console.error("Error fetching Binance prices:", error);
    throw error;
  }
  return priceMap;
}

async function fetchBinance24h(symbols: string[]): Promise<Map<string, { change24h: number; volume: number }>> {
  const map = new Map<string, { change24h: number; volume: number }>();
  try {
    const symbolsParam = symbols.map(s => `"${s}"`).join(",");
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbolsParam}]`;
    const response = await fetch(url);
    if (!response.ok) return map; // non-critical
    const data: Binance24hResponse[] = await response.json();
    for (const t of data) {
      map.set(t.symbol, {
        change24h: parseFloat(t.priceChangePercent) || 0,
        volume: parseFloat(t.volume) || 0,
      });
    }
  } catch {
    // non-critical
  }
  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: assets, error: assetsError } = await supabase
      .from("assets")
      .select("id, symbol, binance_symbol")
      .not("binance_symbol", "is", null);

    if (assetsError) throw assetsError;

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No assets with Binance symbols found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const binanceSymbols = assets
      .map(a => a.binance_symbol)
      .filter((s): s is string => s !== null);

    // Fetch price + 24h stats in parallel
    const [prices, stats24h] = await Promise.all([
      fetchBinancePrices(binanceSymbols),
      fetchBinance24h(binanceSymbols),
    ]);

    const now = new Date().toISOString();
    const updates = [];
    for (const asset of assets) {
      if (asset.binance_symbol && prices.has(asset.binance_symbol)) {
        const price = prices.get(asset.binance_symbol)!;
        const s = stats24h.get(asset.binance_symbol);
        updates.push({
          asset_id: asset.id,
          price,
          price_change_24h: s?.change24h ?? null,
          volume_24h: s ? s.volume * price : null, // convert base volume to USD
          source: "binance",
          timestamp: now,
        });
      }
    }

    if (updates.length > 0) {
      // Primary key is asset_id only
      const { error: upsertError } = await supabase
        .from("price_cache")
        .upsert(updates, { onConflict: "asset_id" });

      if (upsertError) throw upsertError;
    }

    return new Response(
      JSON.stringify({ success: true, updated: updates.length, timestamp: now }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-prices function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
