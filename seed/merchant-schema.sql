-- ============================================================
-- Merchant Platform Schema — Full Cycle
-- ============================================================

-- Merchant Profiles
CREATE TABLE IF NOT EXISTS merchant_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner_user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL UNIQUE,           -- MRC-XXXXXXXX
  nickname TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  merchant_type TEXT NOT NULL DEFAULT 'independent',  -- independent|desk|partner|other
  region TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USDT',
  discoverability TEXT NOT NULL DEFAULT 'public',     -- public|merchant_id_only|hidden
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active',              -- active|restricted|suspended|archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mp_owner ON merchant_profiles(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_mp_nickname ON merchant_profiles(nickname);

-- Merchant Invites
CREATE TABLE IF NOT EXISTS merchant_invites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  to_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',             -- pending|accepted|rejected|withdrawn|expired
  purpose TEXT,
  requested_role TEXT NOT NULL DEFAULT 'operator',
  message TEXT,
  requested_scope TEXT,                               -- JSON array
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_to ON merchant_invites(to_merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_from ON merchant_invites(from_merchant_id, status);

-- Merchant Relationships
CREATE TABLE IF NOT EXISTS merchant_relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  merchant_a_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  merchant_b_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  invite_id TEXT REFERENCES merchant_invites(id),
  relationship_type TEXT NOT NULL DEFAULT 'general',  -- general|lending|arbitrage|capital|strategic
  status TEXT NOT NULL DEFAULT 'active',              -- active|restricted|suspended|terminated|archived
  shared_fields TEXT,                                 -- JSON array
  approval_policy TEXT,                               -- JSON object
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rel_a ON merchant_relationships(merchant_a_id, status);
CREATE INDEX IF NOT EXISTS idx_rel_b ON merchant_relationships(merchant_b_id, status);

-- Merchant Roles (per relationship)
CREATE TABLE IF NOT EXISTS merchant_roles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  role TEXT NOT NULL DEFAULT 'viewer',               -- owner|admin|operator|finance|viewer|commenter
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mr_uniq ON merchant_roles(relationship_id, merchant_id);

-- Deals
CREATE TABLE IF NOT EXISTS merchant_deals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  deal_type TEXT NOT NULL,                           -- lending|arbitrage|partnership|capital_placement
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL DEFAULT 'draft',              -- draft|active|due|settled|closed|overdue|cancelled
  metadata TEXT,                                     -- JSON
  issue_date TEXT,
  due_date TEXT,
  close_date TEXT,
  expected_return REAL,
  realized_pnl REAL,
  created_by TEXT NOT NULL,                          -- merchant_id
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_rel ON merchant_deals(relationship_id, status);

-- Settlements
CREATE TABLE IF NOT EXISTS merchant_settlements (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  paid_amount REAL NOT NULL,
  paid_date TEXT NOT NULL,
  variance_note TEXT,
  submitted_by TEXT NOT NULL,                        -- merchant_id
  status TEXT NOT NULL DEFAULT 'pending',             -- pending|approved|rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sett_deal ON merchant_settlements(deal_id);

-- Profit Records
CREATE TABLE IF NOT EXISTS merchant_profit_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  period TEXT NOT NULL,
  gross_profit REAL NOT NULL,
  net_distributable REAL NOT NULL,
  share_a REAL,
  share_b REAL,
  note TEXT,
  submitted_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prof_deal ON merchant_profit_records(deal_id);

-- Approval Requests
CREATE TABLE IF NOT EXISTS merchant_approvals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  type TEXT NOT NULL,                                -- settlement_submit|profit_record_submit|capital_adjustment|deal_close|relationship_suspend|relationship_terminate|permissions_change
  target_entity_type TEXT,
  target_entity_id TEXT,
  proposed_payload TEXT,                             -- JSON
  status TEXT NOT NULL DEFAULT 'pending',             -- pending|approved|rejected|cancelled|expired
  submitted_by_user_id TEXT NOT NULL,
  submitted_by_merchant_id TEXT NOT NULL,
  resolution_note TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_appr_rel ON merchant_approvals(relationship_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_user ON merchant_approvals(submitted_by_user_id);

-- Messages
CREATE TABLE IF NOT EXISTS merchant_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  sender_user_id TEXT NOT NULL,
  sender_merchant_id TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',          -- text|system|request-note
  body TEXT NOT NULL,
  read_by TEXT,                                       -- JSON array of user_ids
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_rel ON merchant_messages(relationship_id, created_at);

-- Audit Logs
CREATE TABLE IF NOT EXISTS merchant_audit_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  actor_user_id TEXT NOT NULL,
  actor_merchant_id TEXT,
  entity_type TEXT NOT NULL,                         -- invite|relationship|deal|approval|message|profile|settlement|profit
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,                              -- create|update|approve|reject|close|terminate|suspend|archive
  before_state TEXT,                                 -- JSON
  after_state TEXT,                                  -- JSON
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON merchant_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON merchant_audit_logs(actor_user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS merchant_notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  merchant_id TEXT,
  category TEXT NOT NULL,                            -- invite|message|approval|due_alert|risk|system
  title TEXT NOT NULL,
  body TEXT,
  link_type TEXT,                                    -- relationship|deal|invite|approval
  link_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON merchant_notifications(user_id, read_at);
