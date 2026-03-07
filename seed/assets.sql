-- CryptoTracker Asset Seed Data
-- Major cryptocurrencies with Binance trading pairs

INSERT OR IGNORE INTO assets (id, symbol, name, coingecko_id, binance_symbol, category, precision_qty, precision_price)
VALUES
  -- Layer 1
  ('btc-001', 'BTC',  'Bitcoin',         'bitcoin',          'BTCUSDT',  'layer1',   8, 2),
  ('eth-001', 'ETH',  'Ethereum',        'ethereum',         'ETHUSDT',  'layer1',   8, 2),
  ('bnb-001', 'BNB',  'BNB',             'binancecoin',      'BNBUSDT',  'layer1',   8, 2),
  ('sol-001', 'SOL',  'Solana',          'solana',           'SOLUSDT',  'layer1',   8, 2),
  ('xrp-001', 'XRP',  'XRP',             'ripple',           'XRPUSDT',  'layer1',   8, 4),
  ('ada-001', 'ADA',  'Cardano',         'cardano',          'ADAUSDT',  'layer1',   8, 4),
  ('avax-001','AVAX', 'Avalanche',       'avalanche-2',      'AVAXUSDT', 'layer1',   8, 2),
  ('dot-001', 'DOT',  'Polkadot',        'polkadot',         'DOTUSDT',  'layer1',   8, 3),
  ('atom-001','ATOM', 'Cosmos',          'cosmos',           'ATOMUSDT', 'layer1',   8, 3),
  ('ltc-001', 'LTC',  'Litecoin',        'litecoin',         'LTCUSDT',  'layer1',   8, 2),
  ('etc-001', 'ETC',  'Ethereum Classic','ethereum-classic',  'ETCUSDT',  'layer1',   8, 2),
  ('xlm-001', 'XLM',  'Stellar',         'stellar',          'XLMUSDT',  'layer1',   8, 5),
  ('near-001','NEAR', 'NEAR Protocol',   'near',             'NEARUSDT', 'layer1',   8, 3),
  ('apt-001', 'APT',  'Aptos',           'aptos',            'APTUSDT',  'layer1',   8, 3),
  ('sui-001', 'SUI',  'Sui',             'sui',              'SUIUSDT',  'layer1',   8, 4),
  ('sei-001', 'SEI',  'Sei',             'sei-network',      'SEIUSDT',  'layer1',   8, 4),
  ('ton-001', 'TON',  'Toncoin',         'the-open-network', 'TONUSDT',  'layer1',   8, 3),
  ('hbar-001','HBAR', 'Hedera',          'hedera-hashgraph', 'HBARUSDT', 'layer1',   8, 5),
  ('algo-001','ALGO', 'Algorand',        'algorand',         'ALGOUSDT', 'layer1',   8, 4),
  ('icp-001', 'ICP',  'Internet Computer','internet-computer','ICPUSDT', 'layer1',   8, 3),
  ('kas-001', 'KAS',  'Kaspa',           'kaspa',            'KASUSDT',  'layer1',   8, 5),
  ('vet-001', 'VET',  'VeChain',         'vechain',          'VETUSDT',  'layer1',   8, 5),

  -- Layer 2
  ('matic-001','MATIC','Polygon',        'matic-network',    'MATICUSDT','layer2',   8, 4),
  ('arb-001', 'ARB',  'Arbitrum',        'arbitrum',         'ARBUSDT',  'layer2',   8, 4),
  ('op-001',  'OP',   'Optimism',        'optimism',         'OPUSDT',   'layer2',   8, 4),

  -- DeFi
  ('link-001','LINK', 'Chainlink',       'chainlink',        'LINKUSDT', 'defi',     8, 3),
  ('uni-001', 'UNI',  'Uniswap',         'uniswap',          'UNIUSDT',  'defi',     8, 3),
  ('fil-001', 'FIL',  'Filecoin',        'filecoin',         'FILUSDT',  'defi',     8, 3),
  ('aave-001','AAVE', 'Aave',            'aave',             'AAVEUSDT', 'defi',     8, 2),
  ('mkr-001', 'MKR',  'Maker',           'maker',            'MKRUSDT',  'defi',     8, 2),
  ('crv-001', 'CRV',  'Curve DAO',       'curve-dao-token',  'CRVUSDT',  'defi',     8, 4),
  ('snx-001', 'SNX',  'Synthetix',       'havven',           'SNXUSDT',  'defi',     8, 3),
  ('comp-001','COMP', 'Compound',        'compound-governance-token','COMPUSDT','defi',8, 2),
  ('ldo-001', 'LDO',  'Lido DAO',        'lido-dao',         'LDOUSDT',  'defi',     8, 3),
  ('inj-001', 'INJ',  'Injective',       'injective-protocol','INJUSDT', 'defi',     8, 3),

  -- Stablecoins
  ('usdt-001','USDT', 'Tether',          'tether',           NULL,       'stablecoin',8, 4),
  ('usdc-001','USDC', 'USD Coin',        'usd-coin',         NULL,       'stablecoin',8, 4),
  ('dai-001', 'DAI',  'Dai',             'dai',              NULL,       'stablecoin',8, 4),
  ('busd-001','BUSD', 'Binance USD',     'binance-usd',      NULL,       'stablecoin',8, 4),

  -- Meme
  ('doge-001','DOGE', 'Dogecoin',        'dogecoin',         'DOGEUSDT', 'meme',     8, 5),
  ('shib-001','SHIB', 'Shiba Inu',       'shiba-inu',        'SHIBUSDT', 'meme',     8, 8),
  ('pepe-001','PEPE', 'Pepe',            'pepe',             'PEPEUSDT', 'meme',     8, 8),
  ('floki-001','FLOKI','Floki',          'floki',            'FLOKIUSDT','meme',     8, 7),
  ('wif-001', 'WIF',  'dogwifhat',       'dogwifcoin',       'WIFUSDT',  'meme',     8, 4),
  ('bonk-001','BONK', 'Bonk',            'bonk',             'BONKUSDT', 'meme',     8, 8);
