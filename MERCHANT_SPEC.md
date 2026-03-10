# Merchant Platform, End-to-End Full Cycle Specification

## 1. Purpose

This document defines the complete merchant platform lifecycle for a true multi-user system with live merchant discovery, real invite acceptance, authenticated users, shared backend persistence, and auditable collaboration workflows.

The goal is to move from a local single-user merchant page into a real platform where:
- each user can create and manage a merchant portfolio,
- each user can choose a public platform nickname,
- each user receives a unique Merchant ID,
- merchants can be discovered by Merchant ID or nickname,
- users can send and accept collaboration invites,
- merchants can run shared commercial workflows,
- all sensitive actions are authenticated, permissioned, logged, and recoverable.

This spec is intended to guide product, frontend, backend, database, and auth implementation.

---

## 2. Product Principles

1. **Platform first, merchant second**
   - A person does not collaborate as an anonymous browser session.
   - A person must first become an authenticated platform user.
   - That user then owns one merchant portfolio identity.

2. **Identity is separate from deals**
   - Merchant discovery and invitations happen at the platform level.
   - Deals, settlements, capital placements, and approvals happen inside merchant-to-merchant relationships.

3. **Collaboration is explicit and permissioned**
   - No shared access should exist without an accepted invite.
   - No major business action should be applied without traceable authorization.

4. **Approvals must mutate real data**
   - Approval is not a cosmetic status.
   - Approved requests must commit the requested business change.

5. **Every critical step must be auditable**
   - Invites, approvals, settlements, edits, rejections, and closures must produce immutable logs.

---

## 3. Core Actors

### 3.1 Platform User
An authenticated account holder.

### 3.2 Merchant Owner
A platform user who has created a merchant portfolio.

### 3.3 Merchant Collaborator
A platform user linked to another merchant through an accepted invite and granted scoped permissions.

### 3.4 Internal Roles
Each collaboration relation may assign one of the following roles:
- `owner`, full control over merchant portfolio
- `admin`, broad operational control except owner-only actions
- `operator`, can create and update workflows within allowed scope
- `finance`, can submit settlements, profits, capital actions
- `viewer`, read-only access
- `commenter`, can view and message, cannot mutate business records

---

## 4. Merchant Full Cycle Overview

The complete lifecycle is:

1. User signs up and verifies account.
2. User creates merchant portfolio.
3. User picks public nickname and receives Merchant ID.
4. Merchant profile becomes discoverable, based on privacy settings.
5. Another merchant searches by Merchant ID or nickname.
6. Searcher opens target profile and sends collaboration invite.
7. Receiver reviews and accepts or rejects invite.
8. On acceptance, a merchant relationship is created.
9. Parties exchange messages and share scoped merchant data.
10. They create commercial records, lending, arbitrage, partnerships, capital placements.
11. Sensitive actions generate approval requests.
12. Approvals commit real merchant data changes.
13. Settlements, monthly profits, and capital changes update exposure and performance.
14. Relationship may be expanded, restricted, suspended, or terminated.
15. Full audit history remains available.

---

## 5. Functional Scope

### 5.1 Account and Identity
The platform must support:
- sign up
- sign in
- sign out
- email verification
- password reset or external provider recovery
- optional MFA
- session management
- device-safe logout

### 5.2 Merchant Portfolio
Each authenticated user can create one primary merchant portfolio. Future multi-portfolio support may be added later, but the first version should enforce one primary merchant profile per user to keep permissions and UX clean.

Each merchant portfolio contains:
- legal display name
- public nickname, unique
- generated Merchant ID, unique, immutable
- merchant type
- default currency
- country / region
- contact channels
- status
- discoverability settings
- risk metadata
- collaboration preferences
- timestamps

### 5.3 Merchant Discovery
The platform must provide:
- exact search by Merchant ID
- partial search by nickname
- profile preview card
- privacy filtering
- blocklist filtering
- rate limiting and abuse detection

### 5.4 Collaboration Invites
Users must be able to:
- send invite to another merchant
- choose collaboration purpose
- attach introduction note
- define requested scope
- define requested relationship type
- define requested merchant visibility scope
- withdraw pending invite
- accept, reject, or ignore invite

### 5.5 Merchant Relationship Management
Once accepted, the platform creates a relationship between two merchant portfolios.

Relationship types may include:
- general collaboration
- lending relationship
- arbitrage partnership
- capital partner
- referral / sourcing
- strategic partner

Each relationship has:
- source merchant
- target merchant
- relationship type
- status
- roles per party
- visibility settings
- approval policy
- activity log
- created / updated timestamps

### 5.6 Collaboration Workspace
A collaboration workspace must provide:
- merchant overview
- shared exposure summary
- messages / notes
- approval inbox
- deal board
- settlements log
- profit records
- capital movement history
- audit trail

### 5.7 Deal and Transaction Types
The system must support at minimum:
- lending
- arbitrage
- partnership deal
- capital placement
- settlement
- monthly profit recording
- deal closure
- capital adjustment

### 5.8 Approvals
The system must support configurable approval workflows for:
- settlement submission
- profit recording
- capital increase
- capital reduction
- deal closure
- relationship suspension
- permission changes

### 5.9 Notifications
Notifications must cover:
- invite received
- invite accepted
- invite rejected
- request awaiting approval
- approval accepted
- approval rejected
- new message
- settlement due soon
- overdue repayment
- risk escalation

### 5.10 Audit and Compliance
Every critical change must produce an immutable audit log with:
- actor user ID
- actor merchant ID
- action type
- target entity
- before snapshot, where required
- after snapshot, where required
- timestamp
- IP / device metadata if permitted by privacy policy
- reason or note if applicable

---

## 6. Detailed End-to-End Workflow

## 6.1 User Registration and Auth Flow

### Step 1
User creates account with email/password or approved external provider.

### Step 2
Platform verifies email.

### Step 3
User signs in and receives authenticated session.

### Step 4
If the user has no merchant portfolio yet, redirect to merchant onboarding.

### Rules
- Unverified accounts cannot send invites.
- Suspended accounts cannot access merchant collaboration features.
- JWT or session tokens must be validated server-side on every protected API call.

---

## 6.2 Merchant Portfolio Creation Flow

### Step 1
User enters:
- legal name or display name
- public nickname
- merchant category
- region
- contact preference
- optional bio

### Step 2
System validates:
- nickname uniqueness
- reserved word restrictions
- allowed character set
- profanity / abuse guard

### Step 3
System generates immutable Merchant ID.

Suggested format:
- `MRC-8HEX`
- example: `MRC-A19F47C2`

### Step 4
User chooses discoverability:
- public by nickname and Merchant ID
- Merchant ID only
- hidden from directory, direct connection only

### Step 5
Merchant profile is created.

### Output
User lands in Merchant Dashboard with:
- Merchant ID
- nickname
- profile completion state
- discoverability state
- zero active relationships initially

---

## 6.3 Merchant Discovery Flow

### Entry points
- global search box in merchant tab
- dedicated platform directory
- direct Merchant ID lookup

### Search modes
1. Merchant ID exact lookup
2. nickname partial lookup
3. optional advanced filters later, country, category, risk tier, active status

### Search result card fields
- Merchant ID
- nickname
- display name
- region
- merchant type
- verification badge, if applicable
- mutual connections count, optional later
- invite button, if allowed

### Restrictions
- cannot invite self
- cannot invite blocked merchants
- cannot invite suspended merchants
- cannot invite if there is already an active pending invite or active relationship

---

## 6.4 Invite Sending Flow

### Required fields
- target merchant
- relationship purpose
- invite message
- requested collaboration role
- requested visibility scope
- optional merchant-specific scope, if invite concerns a specific deal or merchant line

### Invite states
- `pending`
- `accepted`
- `rejected`
- `withdrawn`
- `expired`

### Actions
Sender can:
- send
- withdraw pending invite
- view invite status

Receiver can:
- accept
- reject
- ignore until expiration

### Expiration
Pending invites should expire automatically after configurable period, example 14 days.

---

## 6.5 Invite Acceptance Flow

### On accept
System must:
1. validate receiver still has permission to accept
2. validate invite not expired or withdrawn
3. create merchant relationship record
4. create role assignments
5. initialize collaboration workspace
6. post system messages to both parties
7. create audit entries
8. emit notifications

### On reject
System must:
- update invite status to rejected
- optionally store rejection reason
- notify sender
- preserve audit trail

---

## 6.6 Collaboration Workspace Flow

Once the relationship exists, both parties access a shared workspace.

### Workspace tabs
- Overview
- Messages
- Deals
- Settlements
- Approvals
- Analytics
- Audit
- Settings

### Shared settings
Each relationship defines:
- what data is visible
- which actions require approval
- who can submit what
- whether messages are required with each request
- whether deal closure requires dual approval

---

## 6.7 Commercial Workflows

## A. Lending Flow

### Create lending record
Fields:
- principal amount
- currency
- issue date
- due date
- expected return
- settlement terms
- counterparty merchant
- status
- notes

### Lifecycle
`draft -> active -> due -> settled / overdue / cancelled`

### Rules
- due date required
- principal > 0
- settlement request may require approval
- overdue state auto-triggers risk flag

### Settlement
A settlement request may include:
- paid amount
- paid date
- variance note
- proof attachment reference

If approved, the lending record updates real balances and status.

---

## B. Arbitrage Flow

### Create arbitrage record
Fields:
- capital used
- markets / venues
- open date
- expected spread
- target close date
- realized PnL when closed
- risk tag

### Lifecycle
`draft -> active -> closed / loss / cancelled`

### Rules
- close action must record realized result
- close may require approval
- delayed close may create alert

---

## C. Partnership Deal Flow

### Create partnership record
Fields:
- deal title
- partner merchant
- total capital
- share ratio
- expected profit model
- term
- status

### Lifecycle
`draft -> active -> monthly-profit-cycles -> closed`

### Profit recording
Monthly profit entries include:
- period
- gross profit
- net distributable
- share amount per party
- note

If approved, analytics and profit totals update.

---

## D. Capital Placement Flow

### Create capital placement
Fields:
- amount
- placement date
- expected yield
- maturity date
- source merchant
- destination merchant
- status

### Lifecycle
`draft -> active -> matured -> returned / rolled / defaulted`

### Rules
- return or roll-over actions may require approval
- maturity alerts required

---

## 6.8 Approval Workflow

This is the most important logic area and must be real.

### Approval request structure
Each approval request must contain:
- request ID
- relationship ID
- request type
- target entity type
- target entity ID
- proposed payload
- submitted by user ID
- submitted by merchant ID
- reviewer role requirements
- status
- submitted at
- resolved at
- resolution note

### Approval request types
- settlement_submit
- profit_record_submit
- capital_adjustment
- deal_close
- relationship_suspend
- relationship_terminate
- permissions_change

### Statuses
- `pending`
- `approved`
- `rejected`
- `cancelled`
- `expired`

### Approval rule
On approval, the system must:
1. validate current entity state,
2. apply mutation inside DB transaction,
3. update affected totals,
4. update analytics aggregates,
5. write audit event,
6. notify both parties.

This must be atomic. If mutation fails, approval cannot complete.

### Rejection rule
On rejection:
- do not mutate business record
- save rejection reason
- notify requester
- preserve proposal for history

---

## 6.9 Messaging Workflow

Messaging exists at the relationship level.

### Message fields
- message ID
- relationship ID
- sender user ID
- sender merchant ID
- body
- message type, text, system, request-note
- created at
- read state
- optional attachment references

### Rules
- system-generated messages are immutable
- deleted user messages should be soft-deleted only
- approval actions may auto-post system notes

---

## 6.10 Analytics and Portfolio Impact

Each merchant dashboard should reflect:
- active capital deployed
- active relationships count
- pending approvals count
- total realized profit
- unsettled exposure
- overdue items
- relationship health score

Each collaboration workspace should reflect:
- exposure with this counterparty
- realized profit with this counterparty
- unsettled obligations
- upcoming due items
- approval turnaround time
- dispute count, if applicable later

---

## 6.11 Risk and Enforcement Rules

### Risk triggers
- overdue lending
- large settlement variance
- repeated rejected approvals
- unusual capital movement patterns
- suspended merchant status

### Enforcement actions
- warning badge
- collaboration restricted mode
- require dual approval
- temporary invite ban
- admin review queue

---

## 6.12 Relationship Closure Flow

A relationship may be:
- archived
- suspended
- terminated

### Suspend
Temporary access restriction while preserving data.

### Archive
Used when inactive but historically valid.

### Terminate
Ends future collaboration, keeps audit logs.

### Termination rules
- cannot terminate with unresolved critical approvals unless forced by admin policy
- must preserve all historical records
- messaging becomes read-only after termination

---

## 7. Data Model

## 7.1 Users
```json
{
  "id": "uuid",
  "email": "string",
  "auth_provider": "local|google|other",
  "email_verified": true,
  "mfa_enabled": false,
  "status": "active|suspended|deleted",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## 7.2 Merchant Profiles
```json
{
  "id": "uuid",
  "owner_user_id": "uuid",
  "merchant_id": "MRC-A19F47C2",
  "nickname": "taheito_trading",
  "display_name": "Taheito Trading",
  "merchant_type": "independent|desk|partner|other",
  "region": "Qatar",
  "default_currency": "USDT",
  "discoverability": "public|merchant_id_only|hidden",
  "bio": "string",
  "status": "active|restricted|suspended|archived",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## 7.3 Merchant Relationships
```json
{
  "id": "uuid",
  "merchant_a_id": "uuid",
  "merchant_b_id": "uuid",
  "relationship_type": "general|lending|arbitrage|capital|strategic",
  "status": "active|restricted|suspended|terminated|archived",
  "shared_fields": ["overview", "deals", "settlements", "analytics"],
  "approval_policy": {
    "settlements": true,
    "profits": true,
    "capital_changes": true,
    "closures": true
  },
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## 7.4 Invites
```json
{
  "id": "uuid",
  "from_merchant_id": "uuid",
  "to_merchant_id": "uuid",
  "status": "pending|accepted|rejected|withdrawn|expired",
  "purpose": "lending collaboration",
  "requested_role": "operator",
  "message": "string",
  "requested_scope": ["messages", "deals", "settlements"],
  "expires_at": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## 7.5 Approval Requests
```json
{
  "id": "uuid",
  "relationship_id": "uuid",
  "type": "settlement_submit",
  "target_entity_type": "lending",
  "target_entity_id": "uuid",
  "proposed_payload": {},
  "status": "pending|approved|rejected|cancelled|expired",
  "submitted_by_user_id": "uuid",
  "submitted_by_merchant_id": "uuid",
  "resolution_note": null,
  "submitted_at": "timestamp",
  "resolved_at": null
}
```

## 7.6 Messages
```json
{
  "id": "uuid",
  "relationship_id": "uuid",
  "sender_user_id": "uuid",
  "sender_merchant_id": "uuid",
  "message_type": "text|system|request-note",
  "body": "string",
  "read_by": ["uuid"],
  "created_at": "timestamp"
}
```

## 7.7 Deals
A normalized shared deals model is recommended with `deal_type` discriminator.

```json
{
  "id": "uuid",
  "relationship_id": "uuid",
  "deal_type": "lending|arbitrage|partnership|capital_placement",
  "title": "string",
  "amount": 25000,
  "currency": "USDT",
  "status": "draft|active|due|settled|closed|overdue|cancelled",
  "metadata": {},
  "created_by": "uuid",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## 7.8 Audit Logs
```json
{
  "id": "uuid",
  "actor_user_id": "uuid",
  "actor_merchant_id": "uuid",
  "entity_type": "invite|relationship|deal|approval|message",
  "entity_id": "uuid",
  "action": "create|update|approve|reject|close|terminate",
  "before_state": {},
  "after_state": {},
  "note": "string",
  "created_at": "timestamp"
}
```

---

## 8. API Specification, Minimum Version

## 8.1 Auth
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/verify-email`
- `POST /auth/reset-password`
- `GET /auth/session`

## 8.2 Merchant Portfolio
- `POST /merchant/profile`
- `GET /merchant/profile/me`
- `PATCH /merchant/profile/me`
- `GET /merchant/profile/:merchantId`
- `GET /merchant/search?q=`

## 8.3 Invites
- `POST /merchant/invites`
- `GET /merchant/invites/inbox`
- `GET /merchant/invites/sent`
- `POST /merchant/invites/:id/accept`
- `POST /merchant/invites/:id/reject`
- `POST /merchant/invites/:id/withdraw`

## 8.4 Relationships
- `GET /merchant/relationships`
- `GET /merchant/relationships/:id`
- `PATCH /merchant/relationships/:id/settings`
- `POST /merchant/relationships/:id/suspend`
- `POST /merchant/relationships/:id/archive`
- `POST /merchant/relationships/:id/terminate`

## 8.5 Messages
- `GET /merchant/relationships/:id/messages`
- `POST /merchant/relationships/:id/messages`
- `POST /merchant/messages/:id/read`

## 8.6 Deals and Financial Actions
- `POST /merchant/relationships/:id/deals`
- `PATCH /merchant/deals/:id`
- `POST /merchant/deals/:id/submit-settlement`
- `POST /merchant/deals/:id/record-profit`
- `POST /merchant/deals/:id/close`
- `POST /merchant/deals/:id/capital-adjustment`

## 8.7 Approvals
- `GET /merchant/approvals/inbox`
- `GET /merchant/approvals/sent`
- `POST /merchant/approvals/:id/approve`
- `POST /merchant/approvals/:id/reject`

## 8.8 Audit
- `GET /merchant/relationships/:id/audit`
- `GET /merchant/profile/me/activity`

---

## 9. Auth, Security, and Access Control

## 9.1 Recommended Auth
Use a hosted auth provider or robust self-managed auth with:
- verified email
- JWT or server session
- refresh flow
- optional MFA
- password reset
- admin suspension support

### Recommendation
Use Clerk, Auth0, or equivalent if speed and security are priorities.
If building custom auth, it must include secure password hashing, token rotation, session revocation, and anti-abuse controls.

## 9.2 Authorization
Permissions must be enforced server-side, never only in frontend.

Every protected action must validate:
- authenticated user exists
- user owns or is assigned to merchant context
- relationship is active
- role allows the action
- action passes approval policy if required

## 9.3 Abuse Protection
- search rate limiting
- invite rate limiting
- brute-force auth protection
- spam invite detection
- blocklist support
- moderation hooks

---

## 10. Realtime Requirements

To support true live merchant discovery and invite acceptance, the system should include realtime updates using WebSocket, SSE, or managed realtime channels.

Realtime events should cover:
- invite created
- invite accepted/rejected/withdrawn
- new message
- approval submitted
- approval resolved
- relationship status changed
- deal updated
- settlement due alert

Frontend must subscribe to:
- current user notifications
- active relationship message streams
- approvals inbox

---

## 11. Database and Transaction Requirements

Use a real shared database, not browser local storage.

Recommended minimum entities:
- users
- sessions
- merchant_profiles
- merchant_relationships
- merchant_roles
- invites
- messages
- deals
- settlements
- profit_records
- approval_requests
- audit_logs
- notifications

### Critical transaction boundaries
The following actions must be atomic DB transactions:
- accept invite and create relationship
- approve settlement and mutate deal + exposure + audit
- approve monthly profit and update aggregates + audit
- terminate relationship and freeze future mutations

---

## 12. UI Pages and Screens

### Auth
- Sign Up
- Login
- Verify Email
- Reset Password

### Merchant Onboarding
- Create Merchant Portfolio
- Nickname Availability Check
- Merchant ID Confirmation

### Merchant Hub
- Overview
- Platform Directory
- Invitations
- Relationships
- Messages
- Approvals
- Deals
- Analytics
- Settings
- Audit

### Relationship Workspace
- Counterparty Overview
- Shared Deals
- Settlements
- Messages
- Approvals
- Shared Analytics
- Relationship Settings

---

## 13. State Machines

## 13.1 Invite
`pending -> accepted`
`pending -> rejected`
`pending -> withdrawn`
`pending -> expired`

No transitions allowed after terminal state.

## 13.2 Relationship
`active -> restricted`
`active -> suspended`
`active -> archived`
`active -> terminated`
`suspended -> active`
`restricted -> active`

Terminated should be terminal.

## 13.3 Approval
`pending -> approved`
`pending -> rejected`
`pending -> cancelled`
`pending -> expired`

## 13.4 Deal
`draft -> active`
`active -> due`
`active -> closed`
`active -> cancelled`
`due -> settled`
`due -> overdue`
`overdue -> settled`

---

## 14. Permissions Matrix, Minimum

| Action | Owner | Admin | Operator | Finance | Viewer | Commenter |
|---|---|---|---|---|---|---|
| View relationship | Yes | Yes | Yes | Yes | Yes | Yes |
| Send message | Yes | Yes | Yes | Yes | No | Yes |
| Create deal | Yes | Yes | Yes | No | No | No |
| Submit settlement | Yes | Yes | No | Yes | No | No |
| Record monthly profit | Yes | Yes | No | Yes | No | No |
| Approve request | Yes | Yes | Optional | Optional | No | No |
| Change permissions | Yes | Optional | No | No | No | No |
| Terminate relationship | Yes | Optional | No | No | No | No |

Exact rules may be configurable per relationship.

---

## 15. Notifications and Inbox Rules

Each user needs a notification center with:
- unread count
- filtered categories
- mark as read
- click-through routing

Notification categories:
- invites
- messages
- approvals
- due alerts
- risk alerts
- system updates

---

## 16. Non-Functional Requirements

- shared backend persistence
- low-latency search for Merchant ID and nickname
- secure authentication
- server-side authorization
- audit integrity
- idempotent invite acceptance handling
- pagination for messages and audit logs
- support for future file attachments
- timezone-safe timestamps, UTC stored, local rendered

---

## 17. MVP Boundaries

### Must have in MVP
- auth
- merchant profile creation
- nickname and Merchant ID
- live search by Merchant ID / nickname
- invite send / accept / reject
- active relationships
- messaging
- at least one shared deal workflow
- approval flow that mutates real data
- audit logs
- notifications

### Should have soon after MVP
- multiple deal types
- richer analytics
- blocklist
- moderation tools
- advanced risk rules
- attachment support

### Later
- multi-merchant ownership per user
- external verification badges
- dispute management
- scoring models
- recommendation engine

---

## 18. Acceptance Criteria

The platform is considered functionally correct when:

1. A new user can sign up, verify, and create merchant profile.
2. The user can choose a unique nickname and receive Merchant ID.
3. Another authenticated merchant can find that profile by Merchant ID or nickname.
4. That merchant can send an invite.
5. The receiving merchant can accept it from another account.
6. Acceptance creates a real persistent relationship in shared backend storage.
7. Both parties can message inside the relationship workspace.
8. One party can submit a settlement or profit record.
9. The other party can approve it.
10. Approval mutates real business data, not just status text.
11. Audit logs record the full action chain.
12. Reloading or signing in from another device still reflects the same live shared data.

---

## 19. Implementation Guidance

### Recommended stack
- Frontend: React or current HTML app migrated gradually
- Auth: Clerk, Auth0, or equivalent
- API: Cloudflare Workers, Node, or equivalent backend
- Database: PostgreSQL, Supabase Postgres, D1 with care, or other shared DB
- Realtime: WebSocket, SSE, or provider channels

### Migration note
If starting from the current standalone HTML build:
- keep existing merchant UI concepts,
- move state from localStorage to API-backed resources,
- introduce user identity first,
- then introduce merchant profile,
- then platform search and invites,
- then replace fake local collaboration with real relationship records.

This sequence matters. If you try to force live collaboration before auth and backend identity exist, the feature will remain fake.

---

## 20. Final Decision

The merchant platform should be built as a true multi-user collaboration system with these layers, in order:

1. Authenticated user identity
2. Merchant portfolio identity
3. Searchable platform directory
4. Invite and relationship model
5. Shared collaboration workspace
6. Approval-driven business mutations
7. Audit, notifications, and realtime sync

Anything less than that is a demo, not a platform.
