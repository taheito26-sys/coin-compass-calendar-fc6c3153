-- ============================================================
-- Merchant Full-Cycle Test Data
-- ============================================================
-- Dependency order: merchant-schema.sql → merchant-seed-data.sql → THIS FILE
-- All INSERTs use OR IGNORE for idempotent re-runs.
--
-- IMPORTANT: The bbb00000... real user profile is defined in merchant-seed-data.sql.
-- If the user already created a profile via the app with a different id,
-- run this first to find the actual id:
--   SELECT id FROM merchant_profiles WHERE owner_user_id = 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq';
-- Then replace all occurrences of 'bbb00000-0000-0000-0000-000000000000' below.
-- ============================================================

-- ============ FAKE MERCHANT PROFILES (idempotent) ============
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

-- ============ RELATIONSHIPS ============
INSERT OR IGNORE INTO merchant_relationships (id, merchant_a_id, merchant_b_id, relationship_type, status, shared_fields, approval_policy, created_at, updated_at) VALUES
  ('rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'bbb00000-0000-0000-0000-000000000000', 'lending', 'active', '["deals","messages","settlements"]', 'dual_approve', '2026-01-20T12:00:00Z', '2026-01-20T12:00:00Z');
INSERT OR IGNORE INTO merchant_relationships (id, merchant_a_id, merchant_b_id, relationship_type, status, shared_fields, approval_policy, created_at, updated_at) VALUES
  ('rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'bbb00000-0000-0000-0000-000000000000', 'partnership', 'active', '["deals","messages","profits"]', 'dual_approve', '2026-02-01T09:00:00Z', '2026-02-01T09:00:00Z');
INSERT OR IGNORE INTO merchant_relationships (id, merchant_a_id, merchant_b_id, relationship_type, status, shared_fields, approval_policy, created_at, updated_at) VALUES
  ('rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'bbb00000-0000-0000-0000-000000000000', 'arbitrage', 'active', '["deals","messages"]', 'dual_approve', '2026-02-10T14:00:00Z', '2026-02-10T14:00:00Z');

-- ============ ROLES ============
INSERT OR IGNORE INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES
  ('role0001-0000-0000-0000-000000000001', 'rel00001-0000-0000-0000-000000000001', 'bbb00000-0000-0000-0000-000000000000', 'owner', '2026-01-20T12:00:00Z');
INSERT OR IGNORE INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES
  ('role0002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'owner', '2026-01-20T12:00:00Z');
INSERT OR IGNORE INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES
  ('role0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', 'bbb00000-0000-0000-0000-000000000000', 'owner', '2026-02-01T09:00:00Z');
INSERT OR IGNORE INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES
  ('role0004-0000-0000-0000-000000000004', 'rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'owner', '2026-02-01T09:00:00Z');
INSERT OR IGNORE INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES
  ('role0005-0000-0000-0000-000000000005', 'rel00003-0000-0000-0000-000000000003', 'bbb00000-0000-0000-0000-000000000000', 'owner', '2026-02-10T14:00:00Z');
INSERT OR IGNORE INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES
  ('role0006-0000-0000-0000-000000000006', 'rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'owner', '2026-02-10T14:00:00Z');

-- ============ DEALS ============
INSERT OR IGNORE INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, metadata, created_by, created_at, updated_at) VALUES
  ('deal0001-0000-0000-0000-000000000001', 'rel00001-0000-0000-0000-000000000001', 'lending', 'BTC Spot Lending - Q1', 50000, 'USDT', 'active', '2026-01-25', '2026-04-25', 52500, '{"rate":"5%","term":"90d"}', 'aaa00001-0000-0000-0000-000000000001', '2026-01-25T10:00:00Z', '2026-01-25T10:00:00Z');
INSERT OR IGNORE INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, realized_pnl, close_date, metadata, created_by, created_at, updated_at) VALUES
  ('deal0002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 'lending', 'ETH Margin Lending - Dec', 20000, 'USDT', 'settled', '2025-12-01', '2026-02-28', 21000, 1050, '2026-02-28', '{"rate":"5.25%","term":"90d"}', 'aaa00001-0000-0000-0000-000000000001', '2025-12-01T08:00:00Z', '2026-02-28T16:00:00Z');
INSERT OR IGNORE INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, metadata, created_by, created_at, updated_at) VALUES
  ('deal0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', 'partnership', 'DeFi Yield Strategy Fund', 100000, 'USDT', 'active', '2026-02-05', '2026-05-05', 112000, '{"strategy":"yield_farming","split":"60/40"}', 'aaa00002-0000-0000-0000-000000000002', '2026-02-05T10:00:00Z', '2026-02-05T10:00:00Z');
INSERT OR IGNORE INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, metadata, created_by, created_at, updated_at) VALUES
  ('deal0004-0000-0000-0000-000000000004', 'rel00002-0000-0000-0000-000000000002', 'capitals', 'SOL Accumulation Pool', 30000, 'USDT', 'draft', '2026-03-08', '{"target_asset":"SOL","dca_frequency":"weekly"}', 'aaa00002-0000-0000-0000-000000000002', '2026-03-08T14:00:00Z', '2026-03-08T14:00:00Z');
INSERT OR IGNORE INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, metadata, created_by, created_at, updated_at) VALUES
  ('deal0005-0000-0000-0000-000000000005', 'rel00003-0000-0000-0000-000000000003', 'arbitrage', 'BTC CEX Arb - Binance/OKX', 75000, 'USDT', 'active', '2026-02-15', '2026-03-15', 76500, '{"exchanges":["binance","okx"],"pair":"BTC/USDT"}', 'aaa00003-0000-0000-0000-000000000003', '2026-02-15T11:00:00Z', '2026-02-15T11:00:00Z');
INSERT OR IGNORE INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, realized_pnl, close_date, metadata, created_by, created_at, updated_at) VALUES
  ('deal0006-0000-0000-0000-000000000006', 'rel00003-0000-0000-0000-000000000003', 'arbitrage', 'ETH Triangular Arb', 40000, 'USDT', 'closed', '2026-01-20', '2026-02-20', 41200, 1350, '2026-02-18', '{"exchanges":["binance","gate","bybit"],"pair":"ETH/USDT"}', 'aaa00003-0000-0000-0000-000000000003', '2026-01-20T09:00:00Z', '2026-02-18T17:00:00Z');

-- ============ SETTLEMENTS ============
INSERT OR IGNORE INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at) VALUES
  ('sett0001-0000-0000-0000-000000000001', 'deal0002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 21050, '2026-02-28', 'Slightly above expected due to early repayment bonus', 'aaa00001-0000-0000-0000-000000000001', 'approved', '2026-02-28T15:00:00Z');
INSERT OR IGNORE INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at) VALUES
  ('sett0002-0000-0000-0000-000000000002', 'deal0006-0000-0000-0000-000000000006', 'rel00003-0000-0000-0000-000000000003', 41350, '2026-02-18', 'Final settlement including fees', 'aaa00003-0000-0000-0000-000000000003', 'approved', '2026-02-18T16:30:00Z');
INSERT OR IGNORE INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at) VALUES
  ('sett0003-0000-0000-0000-000000000003', 'deal0005-0000-0000-0000-000000000005', 'rel00003-0000-0000-0000-000000000003', 25000, '2026-03-09', 'Partial settlement - 1/3 of position closed', 'aaa00003-0000-0000-0000-000000000003', 'pending', '2026-03-09T10:00:00Z');

-- ============ PROFIT RECORDS ============
INSERT OR IGNORE INTO merchant_profit_records (id, deal_id, relationship_id, period, gross_profit, net_distributable, share_a, share_b, note, submitted_by, status, created_at) VALUES
  ('prof0001-0000-0000-0000-000000000001', 'deal0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', '2026-02', 4200, 3780, 2268, 1512, 'February yield: 4.2% gross, 3.78% net after gas', 'aaa00002-0000-0000-0000-000000000002', 'approved', '2026-03-01T08:00:00Z');
INSERT OR IGNORE INTO merchant_profit_records (id, deal_id, relationship_id, period, gross_profit, net_distributable, share_a, share_b, note, submitted_by, status, created_at) VALUES
  ('prof0002-0000-0000-0000-000000000002', 'deal0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', '2026-03-w1', 1850, 1665, 999, 666, 'Week 1 March: Aave + Compound positions', 'aaa00002-0000-0000-0000-000000000002', 'pending', '2026-03-08T09:00:00Z');

-- ============ APPROVALS ============
INSERT OR IGNORE INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at) VALUES
  ('appr0001-0000-0000-0000-000000000001', 'rel00003-0000-0000-0000-000000000003', 'settlement_submit', 'settlement', 'sett0003-0000-0000-0000-000000000003', '{"paid_amount":25000,"paid_date":"2026-03-09","deal_id":"deal0005-0000-0000-0000-000000000005"}', 'pending', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', '2026-03-09T10:05:00Z');
INSERT OR IGNORE INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at) VALUES
  ('appr0002-0000-0000-0000-000000000002', 'rel00002-0000-0000-0000-000000000002', 'profit_record_submit', 'profit', 'prof0002-0000-0000-0000-000000000002', '{"period":"2026-03-w1","gross_profit":1850,"net_distributable":1665}', 'pending', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', '2026-03-08T09:10:00Z');
INSERT OR IGNORE INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at) VALUES
  ('appr0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', 'deal_activate', 'deal', 'deal0004-0000-0000-0000-000000000004', '{"title":"SOL Accumulation Pool","amount":30000}', 'pending', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', '2026-03-08T14:30:00Z');
INSERT OR IGNORE INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, resolution_note, submitted_at, resolved_at) VALUES
  ('appr0004-0000-0000-0000-000000000004', 'rel00001-0000-0000-0000-000000000001', 'settlement_submit', 'settlement', 'sett0001-0000-0000-0000-000000000001', '{"paid_amount":21050,"deal_id":"deal0002-0000-0000-0000-000000000002"}', 'approved', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'Confirmed. Amount matches.', '2026-02-28T15:10:00Z', '2026-02-28T16:00:00Z');

-- ============ MESSAGES ============
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00001-0000-0000-0000-000000000001', 'rel00001-0000-0000-0000-000000000001', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'text', 'Hey, we have 50k USDT available for BTC spot lending. Interested?', '["fake-user-001","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-01-24T08:00:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'text', 'Yes, 5% over 90 days works. Lets set it up.', '["fake-user-001","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-01-24T09:15:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00003-0000-0000-0000-000000000003', 'rel00001-0000-0000-0000-000000000001', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'text', 'Deal created. BTC Spot Lending Q1 activated for 50k USDT.', '["fake-user-001","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-01-25T10:05:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00004-0000-0000-0000-000000000004', 'rel00001-0000-0000-0000-000000000001', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'text', 'Dec ETH lending fully settled. 21,050 USDT returned.', '["fake-user-001","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-02-28T16:30:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00005-0000-0000-0000-000000000005', 'rel00002-0000-0000-0000-000000000002', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'text', 'Launching DeFi yield strategy. 100k USDT, 12% annualized, 60/40 split.', '["fake-user-002","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-02-04T15:00:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00006-0000-0000-0000-000000000006', 'rel00002-0000-0000-0000-000000000002', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'text', 'Looks good. What protocols are you targeting?', '["fake-user-002","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-02-04T15:30:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00007-0000-0000-0000-000000000007', 'rel00002-0000-0000-0000-000000000002', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'text', 'Aave v3, Compound, Curve pools. Feb report: 4.2% gross.', '["fake-user-002","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-03-01T08:30:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00008-0000-0000-0000-000000000008', 'rel00002-0000-0000-0000-000000000002', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'text', 'Proposing SOL accumulation pool - 30k USDT weekly DCA. Please review draft.', '["fake-user-002"]', '2026-03-08T14:15:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00009-0000-0000-0000-000000000009', 'rel00002-0000-0000-0000-000000000002', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'text', 'March W1 profit submitted: $1,850 gross. Approval sent.', '["fake-user-002"]', '2026-03-08T09:15:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00010-0000-0000-0000-000000000010', 'rel00003-0000-0000-0000-000000000003', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'text', 'ETH triangular arb closed. $1,350 profit. Settlement submitted.', '["fake-user-003","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-02-18T17:10:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00011-0000-0000-0000-000000000011', 'rel00003-0000-0000-0000-000000000003', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'text', 'New BTC CEX arb opportunity. 75k USDT, 2% target in 30d.', '["fake-user-003","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-02-15T11:15:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00012-0000-0000-0000-000000000012', 'rel00003-0000-0000-0000-000000000003', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'text', 'Approved. Lets go.', '["fake-user-003","user_3Ad6MYh466dWCuB3zpAWDe5eaUq"]', '2026-02-15T12:00:00Z');
INSERT OR IGNORE INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, read_by, created_at) VALUES
  ('msg00013-0000-0000-0000-000000000013', 'rel00003-0000-0000-0000-000000000003', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'text', 'Partial close on BTC arb. $25k settlement submitted for approval.', '["fake-user-003"]', '2026-03-09T10:10:00Z');

-- ============ NOTIFICATIONS ============
INSERT OR IGNORE INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at) VALUES
  ('notf0001-0000-0000-0000-000000000001', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'approval', 'Settlement approval needed', 'Sensei OTC submitted a $25,000 partial settlement on BTC CEX Arb deal.', 'approval', 'appr0001-0000-0000-0000-000000000001', '2026-03-09T10:05:00Z');
INSERT OR IGNORE INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at) VALUES
  ('notf0002-0000-0000-0000-000000000002', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'approval', 'Profit record review', 'Luna Capital submitted March W1 profit report: $1,850 gross.', 'approval', 'appr0002-0000-0000-0000-000000000002', '2026-03-08T09:10:00Z');
INSERT OR IGNORE INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at) VALUES
  ('notf0003-0000-0000-0000-000000000003', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'deal', 'New deal proposal', 'Luna Capital created a draft deal: SOL Accumulation Pool ($30,000).', 'deal', 'deal0004-0000-0000-0000-000000000004', '2026-03-08T14:30:00Z');
INSERT OR IGNORE INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at) VALUES
  ('notf0004-0000-0000-0000-000000000004', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'message', 'New messages', 'You have unread messages from Luna Capital and Sensei OTC.', 'relationship', 'rel00002-0000-0000-0000-000000000002', '2026-03-09T10:15:00Z');

-- ============ AUDIT LOGS ============
INSERT OR IGNORE INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at) VALUES
  ('audt0001-0000-0000-0000-000000000001', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'deal', 'deal0001-0000-0000-0000-000000000001', 'create', '{"deal_type":"lending","amount":50000}', '2026-01-25T10:00:00Z');
INSERT OR IGNORE INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at) VALUES
  ('audt0002-0000-0000-0000-000000000002', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'deal', 'deal0003-0000-0000-0000-000000000003', 'create', '{"deal_type":"partnership","amount":100000}', '2026-02-05T10:00:00Z');
INSERT OR IGNORE INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at) VALUES
  ('audt0003-0000-0000-0000-000000000003', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'deal', 'deal0005-0000-0000-0000-000000000005', 'create', '{"deal_type":"arbitrage","amount":75000}', '2026-02-15T11:00:00Z');
INSERT OR IGNORE INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at) VALUES
  ('audt0004-0000-0000-0000-000000000004', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'deal', 'deal0006-0000-0000-0000-000000000006', 'close', '{"realized_pnl":1350}', '2026-02-18T17:00:00Z');
INSERT OR IGNORE INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at) VALUES
  ('audt0005-0000-0000-0000-000000000005', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'approval', 'appr0004-0000-0000-0000-000000000004', 'approve', '{"status":"approved"}', '2026-02-28T16:00:00Z');

-- ============ INVITES ============
INSERT OR IGNORE INTO merchant_invites (id, from_merchant_id, to_merchant_id, purpose, requested_role, message, status, created_at, expires_at) VALUES
  ('inv00001-0000-0000-0000-000000000001', 'aaa00004-0000-0000-0000-000000000004', 'bbb00000-0000-0000-0000-000000000000', 'Market-making collaboration on low-cap alts', 'operator', 'Hey, Vortex Labs here. Looking for partners on market-making strategies.', 'pending', '2026-03-09T15:00:00Z', '2026-03-16T15:00:00Z');
INSERT OR IGNORE INTO merchant_invites (id, from_merchant_id, to_merchant_id, purpose, requested_role, message, status, created_at, expires_at) VALUES
  ('inv00002-0000-0000-0000-000000000002', 'aaa00005-0000-0000-0000-000000000005', 'bbb00000-0000-0000-0000-000000000000', 'Cross-border USDT liquidity pool', 'finance', 'Midnight FX proposing a stablecoin liquidity arrangement for Africa corridors.', 'pending', '2026-03-10T06:00:00Z', '2026-03-17T06:00:00Z');
