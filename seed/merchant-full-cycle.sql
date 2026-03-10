-- Full merchant lifecycle simulation
-- Real user: user_3Ad6MYh466dWCuB3zpAWDe5eaUq

-- Ensure real user has a merchant profile
INSERT OR IGNORE INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at)
VALUES ('bbb00000-0000-0000-0000-000000000000', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'MRC-MYPROFILE', 'my_desk', 'My Trading Desk', 'desk', 'Middle East', 'USDT', 'public', 'Personal trading desk.', 'active', '2026-01-15T10:00:00Z', '2026-01-15T10:00:00Z');

-- ============ RELATIONSHIPS ============
-- Alpha Trading <-> My Desk (active, lending)
INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, relationship_type, status, shared_fields, approval_policy, created_at, updated_at)
VALUES ('rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'bbb00000-0000-0000-0000-000000000000', 'lending', 'active', '["deals","messages","settlements"]', 'dual_approve', '2026-01-20T12:00:00Z', '2026-01-20T12:00:00Z');

-- Luna Capital <-> My Desk (active, partnership)
INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, relationship_type, status, shared_fields, approval_policy, created_at, updated_at)
VALUES ('rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'bbb00000-0000-0000-0000-000000000000', 'partnership', 'active', '["deals","messages","profits"]', 'dual_approve', '2026-02-01T09:00:00Z', '2026-02-01T09:00:00Z');

-- Sensei OTC <-> My Desk (active, arbitrage)
INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, relationship_type, status, shared_fields, approval_policy, created_at, updated_at)
VALUES ('rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'bbb00000-0000-0000-0000-000000000000', 'arbitrage', 'active', '["deals","messages"]', 'dual_approve', '2026-02-10T14:00:00Z', '2026-02-10T14:00:00Z');

-- ============ ROLES ============
INSERT INTO merchant_roles (id, relationship_id, merchant_id, role, assigned_at) VALUES
  ('role0001-0000-0000-0000-000000000001', 'rel00001-0000-0000-0000-000000000001', 'bbb00000-0000-0000-0000-000000000000', 'owner', '2026-01-20T12:00:00Z'),
  ('role0002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'owner', '2026-01-20T12:00:00Z'),
  ('role0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', 'bbb00000-0000-0000-0000-000000000000', 'owner', '2026-02-01T09:00:00Z'),
  ('role0004-0000-0000-0000-000000000004', 'rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'owner', '2026-02-01T09:00:00Z'),
  ('role0005-0000-0000-0000-000000000005', 'rel00003-0000-0000-0000-000000000003', 'bbb00000-0000-0000-0000-000000000000', 'owner', '2026-02-10T14:00:00Z'),
  ('role0006-0000-0000-0000-000000000006', 'rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'owner', '2026-02-10T14:00:00Z');

-- ============ DEALS ============
-- Deal 1: Alpha lent 50k USDT — active
INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, metadata, created_by, created_at, updated_at)
VALUES ('deal0001-0000-0000-0000-000000000001', 'rel00001-0000-0000-0000-000000000001', 'lending', 'BTC Spot Lending - Q1', 50000, 'USDT', 'active', '2026-01-25', '2026-04-25', 52500, '{"rate":"5%","term":"90d"}', 'aaa00001-0000-0000-0000-000000000001', '2026-01-25T10:00:00Z', '2026-01-25T10:00:00Z');

-- Deal 2: Alpha lent 20k — settled
INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, realized_pnl, close_date, metadata, created_by, created_at, updated_at)
VALUES ('deal0002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 'lending', 'ETH Margin Lending - Dec', 20000, 'USDT', 'settled', '2025-12-01', '2026-02-28', 21000, 1050, '2026-02-28', '{"rate":"5.25%","term":"90d"}', 'aaa00001-0000-0000-0000-000000000001', '2025-12-01T08:00:00Z', '2026-02-28T16:00:00Z');

-- Deal 3: Luna partnership deal — active, due soon
INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, metadata, created_by, created_at, updated_at)
VALUES ('deal0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', 'partnership', 'DeFi Yield Strategy Fund', 100000, 'USDT', 'active', '2026-02-05', '2026-05-05', 112000, '{"strategy":"yield_farming","split":"60/40"}', 'aaa00002-0000-0000-0000-000000000002', '2026-02-05T10:00:00Z', '2026-02-05T10:00:00Z');

-- Deal 4: Luna — draft, pending activation
INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, metadata, created_by, created_at, updated_at)
VALUES ('deal0004-0000-0000-0000-000000000004', 'rel00002-0000-0000-0000-000000000002', 'capitals', 'SOL Accumulation Pool', 30000, 'USDT', 'draft', '2026-03-08', '{"target_asset":"SOL","dca_frequency":"weekly"}', 'aaa00002-0000-0000-0000-000000000002', '2026-03-08T14:00:00Z', '2026-03-08T14:00:00Z');

-- Deal 5: Sensei OTC arb deal — active
INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, metadata, created_by, created_at, updated_at)
VALUES ('deal0005-0000-0000-0000-000000000005', 'rel00003-0000-0000-0000-000000000003', 'arbitrage', 'BTC CEX Arb - Binance/OKX', 75000, 'USDT', 'active', '2026-02-15', '2026-03-15', 76500, '{"exchanges":["binance","okx"],"pair":"BTC/USDT"}', 'aaa00003-0000-0000-0000-000000000003', '2026-02-15T11:00:00Z', '2026-02-15T11:00:00Z');

-- Deal 6: Sensei OTC — closed with profit
INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, issue_date, due_date, expected_return, realized_pnl, close_date, metadata, created_by, created_at, updated_at)
VALUES ('deal0006-0000-0000-0000-000000000006', 'rel00003-0000-0000-0000-000000000003', 'arbitrage', 'ETH Triangular Arb', 40000, 'USDT', 'closed', '2026-01-20', '2026-02-20', 41200, 1350, '2026-02-18', '{"exchanges":["binance","gate","bybit"],"pair":"ETH/USDT"}', 'aaa00003-0000-0000-0000-000000000003', '2026-01-20T09:00:00Z', '2026-02-18T17:00:00Z');

-- ============ SETTLEMENTS ============
-- Settlement for Deal 2 (settled lending)
INSERT INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at)
VALUES ('sett0001-0000-0000-0000-000000000001', 'deal0002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 21050, '2026-02-28', 'Slightly above expected due to early repayment bonus', 'aaa00001-0000-0000-0000-000000000001', 'approved', '2026-02-28T15:00:00Z');

-- Settlement for Deal 6 (closed arb)
INSERT INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at)
VALUES ('sett0002-0000-0000-0000-000000000002', 'deal0006-0000-0000-0000-000000000006', 'rel00003-0000-0000-0000-000000000003', 41350, '2026-02-18', 'Final settlement including fees', 'aaa00003-0000-0000-0000-000000000003', 'approved', '2026-02-18T16:30:00Z');

-- Pending settlement for Deal 5 (partial)
INSERT INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at)
VALUES ('sett0003-0000-0000-0000-000000000003', 'deal0005-0000-0000-0000-000000000005', 'rel00003-0000-0000-0000-000000000003', 25000, '2026-03-09', 'Partial settlement - 1/3 of position closed', 'aaa00003-0000-0000-0000-000000000003', 'pending', '2026-03-09T10:00:00Z');

-- ============ PROFIT RECORDS ============
-- Profit record for Luna DeFi deal
INSERT INTO merchant_profit_records (id, deal_id, relationship_id, period, gross_profit, net_distributable, share_a, share_b, note, submitted_by, status, created_at)
VALUES ('prof0001-0000-0000-0000-000000000001', 'deal0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', '2026-02', 4200, 3780, 2268, 1512, 'February yield: 4.2% gross, 3.78% net after gas', 'aaa00002-0000-0000-0000-000000000002', 'approved', '2026-03-01T08:00:00Z');

-- Pending profit record for March
INSERT INTO merchant_profit_records (id, deal_id, relationship_id, period, gross_profit, net_distributable, share_a, share_b, note, submitted_by, status, created_at)
VALUES ('prof0002-0000-0000-0000-000000000002', 'deal0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', '2026-03-w1', 1850, 1665, 999, 666, 'Week 1 March: Aave + Compound positions', 'aaa00002-0000-0000-0000-000000000002', 'pending', '2026-03-08T09:00:00Z');

-- ============ APPROVALS (pending for user to act on) ============
-- Approval: Sensei wants to settle partial on Deal 5
INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
VALUES ('appr0001-0000-0000-0000-000000000001', 'rel00003-0000-0000-0000-000000000003', 'settlement_submit', 'settlement', 'sett0003-0000-0000-0000-000000000003', '{"paid_amount":25000,"paid_date":"2026-03-09","deal_id":"deal0005-0000-0000-0000-000000000005"}', 'pending', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', '2026-03-09T10:05:00Z');

-- Approval: Luna submitted March profit record
INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
VALUES ('appr0002-0000-0000-0000-000000000002', 'rel00002-0000-0000-0000-000000000002', 'profit_record_submit', 'profit', 'prof0002-0000-0000-0000-000000000002', '{"period":"2026-03-w1","gross_profit":1850,"net_distributable":1665}', 'pending', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', '2026-03-08T09:10:00Z');

-- Approval: Luna wants to activate the SOL deal
INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
VALUES ('appr0003-0000-0000-0000-000000000003', 'rel00002-0000-0000-0000-000000000002', 'deal_activate', 'deal', 'deal0004-0000-0000-0000-000000000004', '{"title":"SOL Accumulation Pool","amount":30000}', 'pending', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', '2026-03-08T14:30:00Z');

-- Already-approved approvals (history)
INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at, reviewed_by_user_id, reviewed_by_merchant_id, reviewed_at, review_note)
VALUES ('appr0004-0000-0000-0000-000000000004', 'rel00001-0000-0000-0000-000000000001', 'settlement_submit', 'settlement', 'sett0001-0000-0000-0000-000000000001', '{"paid_amount":21050,"deal_id":"deal0002-0000-0000-0000-000000000002"}', 'approved', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', '2026-02-28T15:10:00Z', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', '2026-02-28T16:00:00Z', 'Confirmed. Amount matches.');

-- ============ MESSAGES ============
-- Alpha Trading conversation
INSERT INTO merchant_messages (id, relationship_id, sender_merchant_id, body, read_by, created_at) VALUES
  ('msg00001-0000-0000-0000-000000000001', 'rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'Hey, we have 50k USDT available for BTC spot lending. Interested?', '["aaa00001-0000-0000-0000-000000000001","bbb00000-0000-0000-0000-000000000000"]', '2026-01-24T08:00:00Z'),
  ('msg00002-0000-0000-0000-000000000002', 'rel00001-0000-0000-0000-000000000001', 'bbb00000-0000-0000-0000-000000000000', 'Yes, 5% over 90 days works. Lets set it up.', '["aaa00001-0000-0000-0000-000000000001","bbb00000-0000-0000-0000-000000000000"]', '2026-01-24T09:15:00Z'),
  ('msg00003-0000-0000-0000-000000000003', 'rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'Deal created. I have activated the BTC Spot Lending Q1 deal for 50k USDT.', '["aaa00001-0000-0000-0000-000000000001","bbb00000-0000-0000-0000-000000000000"]', '2026-01-25T10:05:00Z'),
  ('msg00004-0000-0000-0000-000000000004', 'rel00001-0000-0000-0000-000000000001', 'aaa00001-0000-0000-0000-000000000001', 'The Dec ETH lending deal is fully settled. 21,050 USDT returned. Thanks for the smooth collaboration.', '["aaa00001-0000-0000-0000-000000000001","bbb00000-0000-0000-0000-000000000000"]', '2026-02-28T16:30:00Z');

-- Luna Capital conversation
INSERT INTO merchant_messages (id, relationship_id, sender_merchant_id, body, read_by, created_at) VALUES
  ('msg00005-0000-0000-0000-000000000005', 'rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'We are launching a new DeFi yield strategy. 100k USDT, targeting 12% annualized. 60/40 split.', '["aaa00002-0000-0000-0000-000000000002","bbb00000-0000-0000-0000-000000000000"]', '2026-02-04T15:00:00Z'),
  ('msg00006-0000-0000-0000-000000000006', 'rel00002-0000-0000-0000-000000000002', 'bbb00000-0000-0000-0000-000000000000', 'Looks good. What protocols are you targeting?', '["aaa00002-0000-0000-0000-000000000002","bbb00000-0000-0000-0000-000000000000"]', '2026-02-04T15:30:00Z'),
  ('msg00007-0000-0000-0000-000000000007', 'rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'Aave v3, Compound, and some Curve pools. All blue-chip. February report is in — 4.2% gross.', '["aaa00002-0000-0000-0000-000000000002","bbb00000-0000-0000-0000-000000000000"]', '2026-03-01T08:30:00Z'),
  ('msg00008-0000-0000-0000-000000000008', 'rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'Also proposing a SOL accumulation pool — 30k USDT, weekly DCA. Created as draft, please review.', '["aaa00002-0000-0000-0000-000000000002"]', '2026-03-08T14:15:00Z'),
  ('msg00009-0000-0000-0000-000000000009', 'rel00002-0000-0000-0000-000000000002', 'aaa00002-0000-0000-0000-000000000002', 'March W1 profit submitted: $1,850 gross. Approval request sent.', '["aaa00002-0000-0000-0000-000000000002"]', '2026-03-08T09:15:00Z');

-- Sensei OTC conversation
INSERT INTO merchant_messages (id, relationship_id, sender_merchant_id, body, read_by, created_at) VALUES
  ('msg00010-0000-0000-0000-000000000010', 'rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'ETH triangular arb closed with $1,350 profit. Well above target. Settlement submitted.', '["aaa00003-0000-0000-0000-000000000003","bbb00000-0000-0000-0000-000000000000"]', '2026-02-18T17:10:00Z'),
  ('msg00011-0000-0000-0000-000000000011', 'rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'New opportunity: BTC CEX arb between Binance and OKX. 75k USDT, targeting 2% in 30 days.', '["aaa00003-0000-0000-0000-000000000003","bbb00000-0000-0000-0000-000000000000"]', '2026-02-15T11:15:00Z'),
  ('msg00012-0000-0000-0000-000000000012', 'rel00003-0000-0000-0000-000000000003', 'bbb00000-0000-0000-0000-000000000000', 'Approved. Lets go.', '["aaa00003-0000-0000-0000-000000000003","bbb00000-0000-0000-0000-000000000000"]', '2026-02-15T12:00:00Z'),
  ('msg00013-0000-0000-0000-000000000013', 'rel00003-0000-0000-0000-000000000003', 'aaa00003-0000-0000-0000-000000000003', 'Partial close on 1/3 of the BTC arb. $25k settlement submitted for your approval.', '["aaa00003-0000-0000-0000-000000000003"]', '2026-03-09T10:10:00Z');

-- ============ NOTIFICATIONS (unread for user) ============
INSERT INTO merchant_notifications (id, recipient_merchant_id, category, title, body, link_type, link_id, created_at) VALUES
  ('notf0001-0000-0000-0000-000000000001', 'bbb00000-0000-0000-0000-000000000000', 'approval', 'Settlement approval needed', 'Sensei OTC submitted a $25,000 partial settlement on BTC CEX Arb deal.', 'approval', 'appr0001-0000-0000-0000-000000000001', '2026-03-09T10:05:00Z'),
  ('notf0002-0000-0000-0000-000000000002', 'bbb00000-0000-0000-0000-000000000000', 'approval', 'Profit record review', 'Luna Capital submitted March W1 profit report: $1,850 gross.', 'approval', 'appr0002-0000-0000-0000-000000000002', '2026-03-08T09:10:00Z'),
  ('notf0003-0000-0000-0000-000000000003', 'bbb00000-0000-0000-0000-000000000000', 'deal', 'New deal proposal', 'Luna Capital created a draft deal: SOL Accumulation Pool ($30,000).', 'deal', 'deal0004-0000-0000-0000-000000000004', '2026-03-08T14:30:00Z'),
  ('notf0004-0000-0000-0000-000000000004', 'bbb00000-0000-0000-0000-000000000000', 'message', 'New messages', 'You have unread messages from Luna Capital and Sensei OTC.', 'relationship', 'rel00002-0000-0000-0000-000000000002', '2026-03-09T10:15:00Z');

-- ============ AUDIT LOGS ============
INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at) VALUES
  ('audt0001-0000-0000-0000-000000000001', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'deal', 'deal0001-0000-0000-0000-000000000001', 'create', '{"deal_type":"lending","amount":50000}', '2026-01-25T10:00:00Z'),
  ('audt0002-0000-0000-0000-000000000002', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'deal', 'deal0002-0000-0000-0000-000000000002', 'create', '{"deal_type":"lending","amount":20000}', '2025-12-01T08:00:00Z'),
  ('audt0003-0000-0000-0000-000000000003', 'fake-user-001', 'aaa00001-0000-0000-0000-000000000001', 'settlement', 'sett0001-0000-0000-0000-000000000001', 'create', '{"paid_amount":21050}', '2026-02-28T15:00:00Z'),
  ('audt0004-0000-0000-0000-000000000004', 'user_3Ad6MYh466dWCuB3zpAWDe5eaUq', 'bbb00000-0000-0000-0000-000000000000', 'approval', 'appr0004-0000-0000-0000-000000000004', 'approve', '{"status":"approved"}', '2026-02-28T16:00:00Z'),
  ('audt0005-0000-0000-0000-000000000005', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'deal', 'deal0003-0000-0000-0000-000000000003', 'create', '{"deal_type":"partnership","amount":100000}', '2026-02-05T10:00:00Z'),
  ('audt0006-0000-0000-0000-000000000006', 'fake-user-002', 'aaa00002-0000-0000-0000-000000000002', 'profit', 'prof0001-0000-0000-0000-000000000001', 'create', '{"gross_profit":4200}', '2026-03-01T08:00:00Z'),
  ('audt0007-0000-0000-0000-000000000007', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'deal', 'deal0005-0000-0000-0000-000000000005', 'create', '{"deal_type":"arbitrage","amount":75000}', '2026-02-15T11:00:00Z'),
  ('audt0008-0000-0000-0000-000000000008', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'deal', 'deal0006-0000-0000-0000-000000000006', 'close', '{"realized_pnl":1350}', '2026-02-18T17:00:00Z'),
  ('audt0009-0000-0000-0000-000000000009', 'fake-user-003', 'aaa00003-0000-0000-0000-000000000003', 'settlement', 'sett0003-0000-0000-0000-000000000003', 'create', '{"paid_amount":25000}', '2026-03-09T10:00:00Z');

-- ============ INVITES (incoming for flavor) ============
INSERT INTO merchant_invites (id, from_merchant_id, to_merchant_id, purpose, requested_role, message, status, created_at, expires_at) VALUES
  ('inv00001-0000-0000-0000-000000000001', 'aaa00004-0000-0000-0000-000000000004', 'bbb00000-0000-0000-0000-000000000000', 'Market-making collaboration on low-cap alts', 'operator', 'Hey, Vortex Labs here. We are looking for partners on market-making strategies. Interested in a trial?', 'pending', '2026-03-09T15:00:00Z', '2026-03-16T15:00:00Z'),
  ('inv00002-0000-0000-0000-000000000002', 'aaa00005-0000-0000-0000-000000000005', 'bbb00000-0000-0000-0000-000000000000', 'Cross-border USDT liquidity pool', 'finance', 'Midnight FX proposing a stablecoin liquidity arrangement. We handle Africa corridors.', 'pending', '2026-03-10T06:00:00Z', '2026-03-17T06:00:00Z');
