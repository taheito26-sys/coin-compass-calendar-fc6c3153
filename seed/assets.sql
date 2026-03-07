-- CryptoTracker Asset Seed Data
-- Major cryptocurrencies with Binance trading pairs

INSERT OR IGNORE INTO assets (id, symbol, name, coingecko_id, binance_symbol, category, precision_qty, precision_price)
VALUES
  ('btc-001', 'BTC',  'Bitcoin',         'bitcoin',          'BTCUSDT',  'layer1',   8, 2),
  ('eth-001', 'ETH',  'Ethereum',        'ethereum',         'ETHUSDT',  'layer1',   8, 2),
  ('bnb-001', 'BNB',  'BNB',             'binancecoin',      'BNBUSDT',  'layer1',   8, 2),
  ('sol-001', 'SOL',  'Solana',          'solana',           'SOLUSDT',  'layer1',   8, 2),
  ('xrp-001', 'XRP',  'XRP',             'ripple',           'XRPUSDT',  'layer1',   8, 4),
  ('ada-001', 'ADA',  'Cardano',         'cardano',          'ADAUSDT',  'layer1',   8, 4),
  ('doge-001','DOGE', 'Dogecoin',        'dogecoin',         'DOGEUSDT', 'meme',     8, 5),
  ('avax-001','AVAX', 'Avalanche',       'avalanche-2',      'AVAXUSDT', 'layer1',   8, 2),
  ('dot-001', 'DOT',  'Polkadot',        'polkadot',         'DOTUSDT',  'layer1',   8, 3),
  ('matic-001','MATIC','Polygon',        'matic-network',    'MATICUSDT','layer2',   8, 4),
  ('link-001','LINK', 'Chainlink',       'chainlink',        'LINKUSDT', 'defi',     8, 3),
  ('uni-001', 'UNI',  'Uniswap',         'uniswap',          'UNIUSDT',  'defi',     8, 3),
  ('atom-001','ATOM', 'Cosmos',          'cosmos',           'ATOMUSDT', 'layer1',   8, 3),
  ('ltc-001', 'LTC',  'Litecoin',        'litecoin',         'LTCUSDT',  'layer1',   8, 2),
  ('etc-001', 'ETC',  'Ethereum Classic','ethereum-classic',  'ETCUSDT',  'layer1',   8, 2),
  ('xlm-001', 'XLM',  'Stellar',         'stellar',          'XLMUSDT',  'layer1',   8, 5),
  ('near-001','NEAR', 'NEAR Protocol',   'near',             'NEARUSDT', 'layer1',   8, 3),
  ('apt-001', 'APT',  'Aptos',           'aptos',            'APTUSDT',  'layer1',   8, 3),
  ('arb-001', 'ARB',  'Arbitrum',        'arbitrum',         'ARBUSDT',  'layer2',   8, 4),
  ('op-001',  'OP',   'Optimism',        'optimism',         'OPUSDT',   'layer2',   8, 4),
  ('sui-001', 'SUI',  'Sui',             'sui',              'SUIUSDT',  'layer1',   8, 4),
  ('sei-001', 'SEI',  'Sei',             'sei-network',      'SEIUSDT',  'layer1',   8, 4),
  ('fil-001', 'FIL',  'Filecoin',        'filecoin',         'FILUSDT',  'defi',     8, 3),
  ('aave-001','AAVE', 'Aave',            'aave',             'AAVEUSDT', 'defi',     8, 2),
  ('mkr-001', 'MKR',  'Maker',           'maker',            'MKRUSDT',  'defi',     8, 2);
