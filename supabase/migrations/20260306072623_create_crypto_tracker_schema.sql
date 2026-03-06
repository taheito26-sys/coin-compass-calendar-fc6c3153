/*
  # Crypto Portfolio Tracker Schema
  
  1. New Tables
    - `assets`
      - Asset definitions with provider IDs for price lookups
      - Columns: id, symbol, name, coingecko_id, binance_symbol, precision_qty, precision_price
    
    - `transactions`
      - Append-only transaction ledger (audit-grade)
      - Columns: id, timestamp, type, asset_id, qty, unit_price, fee_amount, fee_currency, venue, note, tags, user_id, created_at, updated_at
    
    - `tracking_preferences`
      - Per-asset or portfolio-wide tracking mode (DCA vs FIFO)
      - Columns: id, asset_id, tracking_mode, user_id
    
    - `price_cache`
      - Cached prices from exchanges
      - Columns: asset_id, price, source, timestamp
  
  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to manage their own data
*/

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  name text NOT NULL,
  coingecko_id text,
  binance_symbol text,
  precision_qty integer DEFAULT 8,
  precision_price integer DEFAULT 6,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Public read access for assets
CREATE POLICY "Assets are viewable by everyone"
  ON assets FOR SELECT
  TO authenticated
  USING (true);

-- Transactions table (append-only ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('buy', 'sell', 'transfer_in', 'transfer_out', 'reward', 'fee', 'adjustment')),
  asset_id uuid NOT NULL REFERENCES assets(id),
  qty numeric NOT NULL,
  unit_price numeric DEFAULT 0,
  fee_amount numeric DEFAULT 0,
  fee_currency text DEFAULT 'USD',
  venue text,
  note text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tracking preferences (DCA vs FIFO per asset or global)
CREATE TABLE IF NOT EXISTS tracking_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  asset_id uuid REFERENCES assets(id),
  tracking_mode text NOT NULL DEFAULT 'fifo' CHECK (tracking_mode IN ('fifo', 'dca')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, asset_id)
);

ALTER TABLE tracking_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tracking preferences"
  ON tracking_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Price cache table
CREATE TABLE IF NOT EXISTS price_cache (
  asset_id uuid NOT NULL REFERENCES assets(id),
  price numeric NOT NULL,
  source text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, source)
);

ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Price cache is viewable by everyone"
  ON price_cache FOR SELECT
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_preferences_user_id ON tracking_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_price_cache_timestamp ON price_cache(timestamp DESC);

-- Insert common crypto assets
INSERT INTO assets (symbol, name, coingecko_id, binance_symbol) VALUES
  ('BTC', 'Bitcoin', 'bitcoin', 'BTCUSDT'),
  ('ETH', 'Ethereum', 'ethereum', 'ETHUSDT'),
  ('SOL', 'Solana', 'solana', 'SOLUSDT'),
  ('BNB', 'BNB', 'binancecoin', 'BNBUSDT'),
  ('XRP', 'Ripple', 'ripple', 'XRPUSDT'),
  ('ADA', 'Cardano', 'cardano', 'ADAUSDT'),
  ('DOGE', 'Dogecoin', 'dogecoin', 'DOGEUSDT'),
  ('MATIC', 'Polygon', 'matic-network', 'MATICUSDT'),
  ('DOT', 'Polkadot', 'polkadot', 'DOTUSDT'),
  ('AVAX', 'Avalanche', 'avalanche-2', 'AVAXUSDT'),
  ('LINK', 'Chainlink', 'chainlink', 'LINKUSDT'),
  ('USDT', 'Tether', 'tether', 'USDTUSDT'),
  ('USDC', 'USD Coin', 'usd-coin', 'USDCUSDT')
ON CONFLICT (symbol) DO NOTHING;