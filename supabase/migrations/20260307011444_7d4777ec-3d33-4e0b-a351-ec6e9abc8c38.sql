
-- Assets table (reference data for coins)
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  coingecko_id TEXT,
  binance_symbol TEXT,
  category TEXT DEFAULT 'other',
  precision_qty INTEGER DEFAULT 8,
  precision_price INTEGER DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow public read
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assets are publicly readable" ON public.assets FOR SELECT USING (true);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy','sell','transfer_in','transfer_out','reward','fee','adjustment')),
  asset_id UUID REFERENCES public.assets(id) NOT NULL,
  qty NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  venue TEXT,
  note TEXT,
  tags TEXT[],
  external_id TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Price cache (public data)
CREATE TABLE public.price_cache (
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE PRIMARY KEY,
  price NUMERIC NOT NULL,
  price_change_1h NUMERIC DEFAULT 0,
  price_change_24h NUMERIC DEFAULT 0,
  price_change_7d NUMERIC DEFAULT 0,
  market_cap NUMERIC DEFAULT 0,
  volume_24h NUMERIC DEFAULT 0,
  source TEXT DEFAULT 'coingecko',
  timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price cache is publicly readable" ON public.price_cache FOR SELECT USING (true);

-- Tracking preferences
CREATE TABLE public.tracking_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  asset_id UUID REFERENCES public.assets(id),
  tracking_mode TEXT NOT NULL DEFAULT 'fifo' CHECK (tracking_mode IN ('fifo','dca')),
  UNIQUE(user_id, asset_id)
);

ALTER TABLE public.tracking_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tracking prefs" ON public.tracking_preferences FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Imported files tracking
CREATE TABLE public.imported_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  exchange TEXT NOT NULL,
  export_type TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.imported_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own imported files" ON public.imported_files FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imported files" ON public.imported_files FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Seed common crypto assets
INSERT INTO public.assets (symbol, name, coingecko_id, binance_symbol, category) VALUES
  ('BTC', 'Bitcoin', 'bitcoin', 'BTCUSDT', 'Layer 1'),
  ('ETH', 'Ethereum', 'ethereum', 'ETHUSDT', 'Layer 1'),
  ('SOL', 'Solana', 'solana', 'SOLUSDT', 'Layer 1'),
  ('BNB', 'BNB', 'binancecoin', 'BNBUSDT', 'Layer 1'),
  ('XRP', 'Ripple', 'ripple', 'XRPUSDT', 'Layer 1'),
  ('ADA', 'Cardano', 'cardano', 'ADAUSDT', 'Layer 1'),
  ('AVAX', 'Avalanche', 'avalanche-2', 'AVAXUSDT', 'Layer 1'),
  ('DOT', 'Polkadot', 'polkadot', 'DOTUSDT', 'Layer 1'),
  ('DOGE', 'Dogecoin', 'dogecoin', 'DOGEUSDT', 'Meme'),
  ('SHIB', 'Shiba Inu', 'shiba-inu', 'SHIBUSDT', 'Meme'),
  ('LINK', 'Chainlink', 'chainlink', 'LINKUSDT', 'DeFi'),
  ('MATIC', 'Polygon', 'matic-network', 'MATICUSDT', 'Layer 2'),
  ('LTC', 'Litecoin', 'litecoin', 'LTCUSDT', 'Layer 1'),
  ('ATOM', 'Cosmos', 'cosmos', 'ATOMUSDT', 'Layer 1'),
  ('UNI', 'Uniswap', 'uniswap', 'UNIUSDT', 'DeFi'),
  ('APT', 'Aptos', 'aptos', 'APTUSDT', 'Layer 1'),
  ('ARB', 'Arbitrum', 'arbitrum', 'ARBUSDT', 'Layer 2'),
  ('OP', 'Optimism', 'optimism', 'OPUSDT', 'Layer 2'),
  ('SUI', 'Sui', 'sui', 'SUIUSDT', 'Layer 1'),
  ('NEAR', 'NEAR Protocol', 'near', 'NEARUSDT', 'Layer 1'),
  ('FET', 'Artificial Superintelligence', 'fetch-ai', 'FETUSDT', 'AI'),
  ('RENDER', 'Render', 'render-token', 'RENDERUSDT', 'AI'),
  ('TAO', 'Bittensor', 'bittensor', 'TAOUSDT', 'AI'),
  ('INJ', 'Injective', 'injective-protocol', 'INJUSDT', 'DeFi'),
  ('QNT', 'Quant', 'quant-network', 'QNTUSDT', 'RWA'),
  ('TON', 'Toncoin', 'the-open-network', 'TONUSDT', 'Layer 1'),
  ('TRX', 'TRON', 'tron', 'TRXUSDT', 'Layer 1'),
  ('PEPE', 'Pepe', 'pepe', 'PEPEUSDT', 'Meme'),
  ('USDT', 'Tether', 'tether', NULL, 'Stablecoin'),
  ('USDC', 'USD Coin', 'usd-coin', NULL, 'Stablecoin'),
  ('GRT', 'The Graph', 'the-graph', 'GRTUSDT', 'AI'),
  ('AXS', 'Axie Infinity', 'axie-infinity', 'AXSUSDT', 'NFT'),
  ('BCH', 'Bitcoin Cash', 'bitcoin-cash', 'BCHUSDT', 'Layer 1'),
  ('XLM', 'Stellar', 'stellar', 'XLMUSDT', 'Layer 1'),
  ('AAVE', 'Aave', 'aave', 'AAVEUSDT', 'DeFi'),
  ('MKR', 'Maker', 'maker', 'MKRUSDT', 'DeFi'),
  ('CRV', 'Curve DAO', 'curve-dao-token', 'CRVUSDT', 'DeFi'),
  ('FIL', 'Filecoin', 'filecoin', 'FILUSDT', 'Storage'),
  ('ICP', 'Internet Computer', 'internet-computer', 'ICPUSDT', 'Layer 1'),
  ('HBAR', 'Hedera', 'hedera-hashgraph', 'HBARUSDT', 'Layer 1');
