-- ============ CANONICAL MERCHANT PROFILES ============
-- Cache-bust: v2 2026-03-10
-- This file is the single source of truth for all merchant_profiles rows.
-- Must run AFTER merchant-schema.sql, BEFORE merchant-full-cycle.sql.
--
-- The real user profile (id=69f8c25a-605b-4f2b-beca-8771ea5d2467, nickname=taheito)
-- is created via the app. Do NOT re-insert it here.
-- All fixture references use that actual id.

-- Fake merchant profiles for testing
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00001-0000-0000-0000-000000000001', 'fake-user-001', 'MRC-A1B2C3D4', 'alpha_trading', 'Alpha Trading Desk', 'desk', 'Asia', 'USDT', 'public', 'High-frequency crypto desk specializing in BTC/ETH arbitrage across CEXs.', 'active', '2025-11-01T10:00:00Z', '2025-11-01T10:00:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00002-0000-0000-0000-000000000002', 'fake-user-002', 'MRC-E5F6G7H8', 'luna_capital', 'Luna Capital Partners', 'partner', 'Europe', 'USDT', 'public', 'Institutional lending and DeFi yield strategies. Basel-based.', 'active', '2025-12-05T08:30:00Z', '2025-12-05T08:30:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00003-0000-0000-0000-000000000003', 'fake-user-003', 'MRC-I9J0K1L2', 'sensei_otc', 'Sensei OTC', 'independent', 'Middle East', 'USDT', 'public', 'OTC broker for large-block crypto trades. 24/7 settlement.', 'active', '2026-01-10T14:00:00Z', '2026-01-10T14:00:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00004-0000-0000-0000-000000000004', 'fake-user-004', 'MRC-M3N4O5P6', 'vortex_labs', 'Vortex Labs', 'desk', 'North America', 'USDC', 'public', 'Quantitative trading firm. Market-making and statistical arb.', 'active', '2026-01-20T09:15:00Z', '2026-01-20T09:15:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00005-0000-0000-0000-000000000005', 'fake-user-005', 'MRC-Q7R8S9T0', 'midnight_fx', 'Midnight FX', 'independent', 'Africa', 'USDT', 'public', 'Cross-border payments and stablecoin liquidity provider.', 'active', '2026-02-01T18:00:00Z', '2026-02-01T18:00:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00006-0000-0000-0000-000000000006', 'fake-user-006', 'MRC-U1V2W3X4', 'dao_bridge', 'DAO Bridge Collective', 'partner', 'Asia', 'USDT', 'merchant_id_only', 'Treasury management for DAOs. Multi-sig coordination.', 'active', '2026-02-14T12:00:00Z', '2026-02-14T12:00:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00007-0000-0000-0000-000000000007', 'fake-user-007', 'MRC-Y5Z6A7B8', 'polar_ventures', 'Polar Ventures', 'partner', 'Europe', 'EUR', 'public', 'Early-stage crypto fund. Seed to Series A.', 'active', '2026-02-20T07:45:00Z', '2026-02-20T07:45:00Z');
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at) VALUES
  ('aaa00008-0000-0000-0000-000000000008', 'fake-user-008', 'MRC-C9D0E1F2', 'khan_digital', 'Khan Digital Assets', 'independent', 'Middle East', 'USDT', 'public', 'Spot and derivatives trading. Dubai-licensed.', 'active', '2026-03-01T11:30:00Z', '2026-03-01T11:30:00Z');
