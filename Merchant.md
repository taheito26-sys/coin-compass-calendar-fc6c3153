# Merchant Platform — End-to-End Documentation

Complete technical documentation covering architecture, database schema, backend API routes, frontend components, and step-by-step user flows.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Database Schema](#3-database-schema)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Backend API Routes](#5-backend-api-routes)
6. [Frontend API Client](#6-frontend-api-client)
7. [Frontend Page & Components](#7-frontend-page--components)
8. [End-to-End User Flows](#8-end-to-end-user-flows)
9. [State Machines](#9-state-machines)
10. [Deployment & Setup](#10-deployment--setup)
11. [File Map](#11-file-map)

---

## 1. Architecture Overview

```
┌─────────────────────┐       HTTPS + JWT        ┌─────────────────────────┐
│   React Frontend    │ ──────────────────────▶  │  Cloudflare Worker      │
│   (Vite + TS)       │                          │  (Hono Framework)       │
│                     │ ◀──────────────────────  │                         │
│  Clerk Auth (JWT)   │       JSON responses      │  RS256 JWT Verification │
└─────────────────────┘                          └────────┬────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Cloudflare D1   │
                                                 │  (SQLite)        │
                                                 │                  │
                                                 │  12 merchant     │
                                                 │  tables          │
                                                 └─────────────────┘
```

- **Frontend**: React SPA served via Lovable/Cloudflare Pages
- **Backend**: Hono-based Cloudflare Worker (single codebase at `backend/`)
- **Database**: Cloudflare D1 (SQLite-compatible), schema at `seed/merchant-schema.sql`
- **Auth**: Clerk RS256 JWTs verified server-side via JWKS endpoint
- **No Supabase**: The entire stack is Cloudflare-native

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend framework | React 18 + TypeScript | Vite bundler |
| Auth provider | Clerk (`@clerk/react`) | Google, Apple, Facebook, Microsoft OAuth + password |
| API client | Custom fetch wrapper | `src/lib/merchantApi.ts` |
| Backend runtime | Cloudflare Worker | Hono router |
| Database | Cloudflare D1 | SQLite dialect |
| JWT verification | RS256 via Web Crypto API | JWKS fetched from Clerk, cached 1hr |

---

## 3. Database Schema

All merchant tables are defined in `seed/merchant-schema.sql`. There are **12 tables**:

### 3.1 `merchant_profiles`
One profile per authenticated user. Stores identity, discoverability, and status.

```sql
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
```

**Indexes**: `UNIQUE(owner_user_id)`, `INDEX(nickname)`

### 3.2 `merchant_invites`
Collaboration invitations between merchants.

```sql
CREATE TABLE IF NOT EXISTS merchant_invites (
  id TEXT PRIMARY KEY,
  from_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  to_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',    -- pending|accepted|rejected|withdrawn|expired
  purpose TEXT,
  requested_role TEXT NOT NULL DEFAULT 'operator',
  message TEXT,
  requested_scope TEXT,                      -- JSON array
  expires_at TEXT,
  created_at TEXT, updated_at TEXT
);
```

### 3.3 `merchant_relationships`
Created when an invite is accepted. Links two merchant profiles.

```sql
CREATE TABLE IF NOT EXISTS merchant_relationships (
  id TEXT PRIMARY KEY,
  merchant_a_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  merchant_b_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  invite_id TEXT REFERENCES merchant_invites(id),
  relationship_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',     -- active|restricted|suspended|terminated|archived
  shared_fields TEXT,                        -- JSON array
  approval_policy TEXT,                      -- JSON object
  created_at TEXT, updated_at TEXT
);
```

### 3.4 `merchant_roles`
Per-relationship role assignments (owner, admin, operator, finance, viewer, commenter).

### 3.5 `merchant_deals`
Commercial records within a relationship. Types: lending, arbitrage, partnership, capital_placement.

```sql
CREATE TABLE IF NOT EXISTS merchant_deals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  deal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL DEFAULT 'draft',      -- draft|active|due|settled|closed|overdue|cancelled
  metadata TEXT,                             -- JSON
  issue_date TEXT, due_date TEXT, close_date TEXT,
  expected_return REAL, realized_pnl REAL,
  created_by TEXT NOT NULL,
  created_at TEXT, updated_at TEXT
);
```

### 3.6 `merchant_settlements`
Settlement submissions against deals. Requires counterparty approval.

### 3.7 `merchant_profit_records`
Monthly profit entries for partnership/capital deals.

### 3.8 `merchant_approvals`
Approval requests for sensitive actions (settlement, profit, close, suspend, terminate).

```sql
CREATE TABLE IF NOT EXISTS merchant_approvals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  type TEXT NOT NULL,     -- settlement_submit|profit_record_submit|capital_adjustment|deal_close|...
  target_entity_type TEXT, target_entity_id TEXT,
  proposed_payload TEXT,  -- JSON
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by_user_id TEXT NOT NULL,
  submitted_by_merchant_id TEXT NOT NULL,
  resolution_note TEXT,
  submitted_at TEXT, resolved_at TEXT
);
```

### 3.9 `merchant_messages`
Per-relationship messaging. Types: text, system, request-note.

### 3.10 `merchant_audit_logs`
Immutable audit trail for all critical actions.

### 3.11 `merchant_notifications`
User-scoped notifications (invite, message, approval, due_alert, risk, system).

---

## 4. Authentication & Authorization

### 4.1 Auth Flow

1. User signs in via Clerk (frontend `@clerk/react`)
2. Clerk issues RS256 JWT with `sub` = Clerk user ID
3. Frontend attaches JWT as `Authorization: Bearer <token>` on every API call
4. Worker middleware (`backend/src/middleware/auth.ts`) verifies the JWT:
   - Fetches JWKS from `CLERK_JWKS_URL` (cached 1hr)
   - Validates RS256 signature using Web Crypto API
   - Checks `exp` and `nbf` claims
   - Extracts `sub` → sets `c.set("userId", sub)`

### 4.2 Auth Middleware Code

**File**: `backend/src/middleware/auth.ts`

```typescript
export async function authMiddleware(c, next) {
  const token = c.req.header("Authorization")?.slice(7);
  const payload = await verifyRs256(token, c.env.CLERK_JWKS_URL);
  c.set("userId", payload.sub);
  await next();
}
```

Key implementation details:
- JWKS keys are cached in a `Map<string, CryptoKey>` for 1 hour
- Base64URL decoding is done manually (no external deps)
- `crypto.subtle.verify()` with RSASSA-PKCS1-v1_5 algorithm

### 4.3 Authorization Model

- Every merchant route checks `userId` from the JWT
- Profile ownership: `merchant_profiles.owner_user_id = userId`
- Relationship access: verified by checking `merchant_a_id` or `merchant_b_id` belongs to the user's profile
- Role-based permissions per relationship via `merchant_roles` table

---

## 5. Backend API Routes

All routes are registered in `backend/src/index.ts` under the `/api/merchant` prefix.

### 5.1 Profiles (`backend/src/routes/merchant-profiles.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/profile/me` | ✅ | Get current user's merchant profile |
| `POST` | `/api/merchant/profile` | ✅ | Create merchant profile (onboarding) |
| `PATCH` | `/api/merchant/profile/me` | ✅ | Update display name, bio, region, discoverability |
| `GET` | `/api/merchant/profile/:merchantId` | ✅ | Lookup profile by merchant ID or row ID |
| `GET` | `/api/merchant/search?q=` | ✅ | Search active, non-hidden profiles by query |
| `GET` | `/api/merchant/check-nickname?nickname=` | ✅ | Check nickname availability |

**Profile creation logic**:
- Generates `MRC-XXXX` merchant ID using `crypto.getRandomValues`
- Validates nickname: 3-30 chars, `[a-z0-9_]`, unique
- Enforces one profile per user (409 if exists)

### 5.2 Invites (`backend/src/routes/merchant-invites.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/merchant/invites` | ✅ | Send invite to another merchant |
| `GET` | `/api/merchant/invites/inbox` | ✅ | List received invites |
| `GET` | `/api/merchant/invites/sent` | ✅ | List sent invites |
| `POST` | `/api/merchant/invites/:id/accept` | ✅ | Accept invite → creates relationship |
| `POST` | `/api/merchant/invites/:id/reject` | ✅ | Reject invite |
| `POST` | `/api/merchant/invites/:id/withdraw` | ✅ | Withdraw pending invite |

**Accept logic**:
- Validates invite not expired/withdrawn
- Creates `merchant_relationships` row
- Creates `merchant_roles` for both parties (inviter = owner, invitee = requested_role)
- Updates invite status to `accepted`
- Creates notification for sender
- Inserts audit log

### 5.3 Relationships (`backend/src/routes/merchant-relationships.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/relationships` | ✅ | List all relationships |
| `GET` | `/api/merchant/relationships/:id` | ✅ | Get relationship details + summary |
| `PATCH` | `/api/merchant/relationships/:id/settings` | ✅ | Update type, shared_fields, approval_policy |
| `POST` | `/api/merchant/relationships/:id/suspend` | ✅ | Suspend relationship |
| `POST` | `/api/merchant/relationships/:id/terminate` | ✅ | Terminate relationship |

**Summary computation** (on GET /:id):
```
totalDeals, activeExposure, realizedProfit, pendingApprovals
```

### 5.4 Deals (`backend/src/routes/merchant-deals.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/deals?relationship_id=` | ✅ | List deals (optionally filtered) |
| `POST` | `/api/merchant/deals` | ✅ | Create a new deal |
| `PATCH` | `/api/merchant/deals/:id` | ✅ | Update deal fields |
| `POST` | `/api/merchant/deals/:id/submit-settlement` | ✅ | Submit settlement → creates approval |
| `POST` | `/api/merchant/deals/:id/record-profit` | ✅ | Record profit → creates approval |
| `POST` | `/api/merchant/deals/:id/close` | ✅ | Request deal closure → creates approval |

### 5.5 Messages (`backend/src/routes/merchant-messages.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/messages/:relId/messages` | ✅ | List messages for a relationship |
| `POST` | `/api/merchant/messages/:relId/messages` | ✅ | Send a message |
| `POST` | `/api/merchant/messages/mark-read/:id` | ✅ | Mark message as read |

### 5.6 Approvals (`backend/src/routes/merchant-approvals.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/approvals/inbox` | ✅ | Approvals where you are reviewer |
| `GET` | `/api/merchant/approvals/sent` | ✅ | Approvals you submitted |
| `POST` | `/api/merchant/approvals/:id/approve` | ✅ | Approve request → mutates real data |
| `POST` | `/api/merchant/approvals/:id/reject` | ✅ | Reject request |

**Approve logic** (type-specific mutations):
- `settlement_submit` → updates settlement status to `approved`, deal status to `settled`
- `profit_record_submit` → updates profit record status to `approved`
- `deal_close` → updates deal status to `closed`, sets `close_date`
- `relationship_suspend` → updates relationship status to `suspended`
- `relationship_terminate` → updates relationship status to `terminated`
- `capital_adjustment` → applies capital changes
- Creates notification, audit log, and system message for each

### 5.7 Audit (`backend/src/routes/merchant-audit.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/audit/relationship/:id` | ✅ | Audit logs for a relationship |
| `GET` | `/api/merchant/audit/activity` | ✅ | Your personal activity log |

### 5.8 Notifications (`backend/src/routes/merchant-notifications.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/merchant/notifications?limit=&unread=` | ✅ | List notifications |
| `GET` | `/api/merchant/notifications/count` | ✅ | Unread count |
| `POST` | `/api/merchant/notifications/:id/read` | ✅ | Mark one as read |
| `POST` | `/api/merchant/notifications/read-all` | ✅ | Mark all as read |

---

## 6. Frontend API Client

**File**: `src/lib/merchantApi.ts`

A thin typed wrapper over `fetch` that:
1. Gets the Clerk session token via `window.Clerk.session.getToken()`
2. Prepends `VITE_WORKER_API_URL` to all paths
3. Attaches `Authorization: Bearer <token>` header
4. Parses JSON responses and throws on non-OK status

### Key Types Exported

```typescript
export interface MerchantProfile { id, owner_user_id, merchant_id, nickname, display_name, ... }
export interface MerchantInvite { id, from_merchant_id, to_merchant_id, status, purpose, ... }
export interface MerchantRelationship { id, merchant_a_id, merchant_b_id, status, my_role, ... }
export interface MerchantDeal { id, relationship_id, deal_type, title, amount, status, ... }
export interface MerchantMessage { id, relationship_id, sender_user_id, body, ... }
export interface MerchantApproval { id, relationship_id, type, status, ... }
export interface AuditLog { id, actor_user_id, entity_type, action, ... }
export interface MerchantNotification { id, user_id, category, title, read_at, ... }
```

### Key Functions

```typescript
// Profile
fetchMyProfile(), createProfile(data), updateProfile(data), searchMerchants(q), checkNickname(nick)

// Invites
sendInvite(data), fetchInbox(), fetchSentInvites(), acceptInvite(id), rejectInvite(id), withdrawInvite(id)

// Relationships
fetchRelationships(), fetchRelationship(id), suspendRelationship(id), terminateRelationship(id)

// Deals
fetchDeals(relId?), createDeal(data), updateDeal(id, data), submitSettlement(dealId, data), recordProfit(dealId, data), closeDeal(dealId)

// Messages
fetchMessages(relId), sendMessage(relId, body)

// Approvals
fetchApprovalInbox(), fetchSentApprovals(), approveRequest(id, note?), rejectRequest(id, note?)

// Audit & Notifications
fetchRelAudit(relId), fetchMyActivity(), fetchNotifications(), fetchUnreadCount(), markNotificationRead(id), markAllRead()
```

---

## 7. Frontend Page & Components

**File**: `src/pages/MerchantPage.tsx` (845 lines, single-file architecture)

### 7.1 Page Structure

The main `MerchantPage` component:
1. Checks `isSignedIn` via Clerk's `useAuth()`
2. Fetches profile via `fetchMyProfile()`
3. If no profile → renders `MerchantOnboarding`
4. If profile exists → renders tabbed merchant hub
5. Polls unread notification count every 15 seconds

### 7.2 Tab Components

| Tab | Component | Description |
|-----|-----------|-------------|
| Overview | `OverviewTab` | Profile card + stat cards (relationships, deals, exposure, P&L, notifications) |
| Directory | `DirectoryTab` | Search merchants + send invite modal |
| Invites | `InvitesTab` | Inbox/sent toggle, accept/reject/withdraw actions |
| Relationships | `RelationshipsTab` | List relationships, click to open workspace |
| Deals | (inline) | Global deal list across all relationships |
| Messages | (placeholder) | Redirects to relationship workspace |
| Approvals | `ApprovalsTab` | Inbox/sent approvals, approve/reject actions |
| Notifications | `NotificationsTab` | Notification list with mark read/all |
| Audit | `AuditTab` | Personal activity log |
| Settings | `MerchantSettingsTab` | Edit display name, bio, region, discoverability |

### 7.3 Relationship Workspace

`RelationshipWorkspace` opens when a relationship is selected. Sub-tabs:
- **Overview**: Counterparty info + summary stats
- **Deals**: Create deals, activate, submit settlements
- **Messages**: Real-time-ish chat (reload on send)
- **Audit**: Relationship-specific audit trail

### 7.4 Helper Components

- `StatCard`: Metric display card (label, value, accent color)
- `StatusBadge`: Color-coded status pill
- `MerchantOnboarding`: Profile creation form with nickname availability check

---

## 8. End-to-End User Flows

### Flow 1: Merchant Onboarding

```
Step 1: User signs in via Clerk
Step 2: MerchantPage loads → fetchMyProfile() returns null
Step 3: MerchantOnboarding form renders
Step 4: User enters display name, nickname, type, region, bio, discoverability
Step 5: Nickname is checked in real-time via GET /api/merchant/check-nickname
Step 6: User clicks "Create Merchant Profile"
Step 7: POST /api/merchant/profile → backend generates MRC-XXXX ID
Step 8: Profile created → page reloads to merchant hub
```

### Flow 2: Discover & Invite a Merchant

```
Step 1: User navigates to Directory tab
Step 2: Types merchant ID or nickname → clicks Search
Step 3: GET /api/merchant/search?q=... returns matching profiles
Step 4: User clicks "Send Invite" on a result
Step 5: Modal opens → user enters purpose and message
Step 6: POST /api/merchant/invites → invite created
Step 7: Receiver gets a notification (merchant_notifications row)
```

### Flow 3: Accept Invite & Form Relationship

```
Step 1: Receiver opens Invites tab → Inbox
Step 2: GET /api/merchant/invites/inbox shows pending invite
Step 3: User clicks "Accept"
Step 4: POST /api/merchant/invites/:id/accept
Step 5: Backend creates merchant_relationships + merchant_roles rows
Step 6: Backend creates notification for sender + audit log
Step 7: Both users now see the relationship in their Relationships tab
```

### Flow 4: Create & Manage a Deal

```
Step 1: User opens a relationship workspace
Step 2: Navigates to Deals sub-tab → clicks "+ New Deal"
Step 3: Fills in type (lending/arbitrage/partnership/capital), title, amount, due date
Step 4: POST /api/merchant/deals → deal created in "draft" status
Step 5: User clicks "Activate" → PATCH to set status = "active"
Step 6: When ready, user clicks "Settle" → enters amount
Step 7: POST /api/merchant/deals/:id/submit-settlement
Step 8: Backend creates merchant_settlements + merchant_approvals rows
Step 9: Counterparty sees approval in their Approvals inbox
```

### Flow 5: Approve a Settlement

```
Step 1: Counterparty opens Approvals tab → Inbox
Step 2: Sees pending "settlement submit" approval
Step 3: Clicks "Approve" → optionally adds note
Step 4: POST /api/merchant/approvals/:id/approve
Step 5: Backend mutates real data:
   - Settlement status → "approved"
   - Deal status → "settled"
   - Creates audit log
   - Creates notification for submitter
   - Posts system message to relationship
```

### Flow 6: Messaging

```
Step 1: User opens relationship workspace → Messages sub-tab
Step 2: Types message → clicks Send or presses Enter
Step 3: POST /api/merchant/messages/:relId/messages
Step 4: Backend inserts message + creates notification for counterparty
Step 5: Messages list refreshes
```

---

## 9. State Machines

### Invite States
```
pending → accepted
pending → rejected
pending → withdrawn
pending → expired (14-day TTL)
```

### Relationship States
```
active → restricted → active
active → suspended → active
active → terminated (terminal)
active → archived
```

### Deal States
```
draft → active → due → settled
                    → overdue → settled
active → closed
active → cancelled
```

### Approval States
```
pending → approved (mutates data)
pending → rejected
pending → cancelled
pending → expired
```

---

## 10. Deployment & Setup

### 10.1 Prerequisites

- Cloudflare account with Workers, D1, and KV enabled
- Clerk account with RS256 JWKS endpoint
- Node.js 18+

### 10.2 Database Setup

```bash
# From backend/ directory:

# Create D1 database (if not exists)
npx wrangler d1 create crypto-tracker

# Seed core schema
npx wrangler d1 execute crypto-tracker --remote --file=../seed/schema.sql
npx wrangler d1 execute crypto-tracker --remote --file=../seed/assets.sql

# Seed merchant schema
npx wrangler d1 execute crypto-tracker --remote --file=../seed/merchant-schema.sql
```

### 10.3 Secrets

```bash
npx wrangler secret put CLERK_JWKS_URL
# → https://<your-clerk-domain>/.well-known/jwks.json

npx wrangler secret put ALLOWED_ORIGINS
# → https://your-app.lovable.app,https://preview-domain.lovable.app
```

### 10.4 Deploy

```bash
cd backend
npm install
npx wrangler deploy
```

### 10.5 Frontend Environment

Set in Lovable project secrets:
```
VITE_WORKER_API_URL=https://cryptotracker-api.<your-subdomain>.workers.dev
```

---

## 11. File Map

```
seed/
  merchant-schema.sql          # All 12 merchant tables

backend/src/
  index.ts                     # Route registration (8 merchant route groups)
  middleware/auth.ts            # Clerk RS256 JWT verification
  routes/
    merchant-profiles.ts       # Profile CRUD + search + nickname check
    merchant-invites.ts        # Invite lifecycle (send/accept/reject/withdraw)
    merchant-relationships.ts  # Relationship management + suspend/terminate
    merchant-deals.ts          # Deal CRUD + settlement/profit/close workflows
    merchant-messages.ts       # Per-relationship messaging
    merchant-approvals.ts      # Approval inbox + approve/reject with data mutation
    merchant-audit.ts          # Audit log queries
    merchant-notifications.ts  # Notification list + read management

src/
  lib/merchantApi.ts           # Typed frontend API client (all merchant endpoints)
  pages/MerchantPage.tsx       # Full merchant UI (845 lines, 10 tabs + workspace)

MERCHANT_SPEC.md               # Product specification (1132 lines)
```

---

## Summary

The Merchant Platform is a complete B2B collaboration system built on Cloudflare Workers + D1 with Clerk auth. It supports the full lifecycle from profile creation → discovery → invite → relationship → deals → settlements → approvals → audit, with every sensitive action producing immutable audit logs and real data mutations on approval.
