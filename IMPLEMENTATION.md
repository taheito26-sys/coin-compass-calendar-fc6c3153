# CoinCompass — Complete Implementation Specification

> **Purpose**: Rebuild-from-scratch reference. Every object, interface, route, schema, component, and data flow needed to recreate the application.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Authentication](#3-authentication)
4. [Database Schema (D1)](#4-database-schema-d1)
5. [Backend Worker (Hono)](#5-backend-worker-hono)
6. [Frontend State Management](#6-frontend-state-management)
7. [Core Libraries](#7-core-libraries)
8. [Hooks](#8-hooks)
9. [Pages](#9-pages)
10. [Components](#10-components)
11. [Import Pipeline](#11-import-pipeline)
12. [Price System](#12-price-system)
13. [Merchant Platform](#13-merchant-platform)
14. [Styling & Theming](#14-styling--theming)
15. [Environment & Deployment](#15-environment--deployment)
16. [File Structure](#16-file-structure)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite + React)                  │
│  ClerkProvider → CryptoProvider → AppShell → Pages              │
│  State: CryptoContext (txs, prefs) + useLivePrices (WS/REST)    │
│  Portfolio: derivePortfolio() FIFO pipeline (pure, no storage)   │
├─────────────────────────────────────────────────────────────────┤
│                    CLOUDFLARE WORKER (Hono)                      │
│  Auth: RS256 JWT via Clerk JWKS                                  │
│  Routes: /api/assets, /api/transactions, /api/prices, etc.      │
│  Cron: pollPrices every 2 min                                    │
├───────────────┬─────────────────────────────────────────────────┤
│  Cloudflare D1 │  Cloudflare KV (PRICE_KV)                      │
│  SQLite tables  │  prices:latest, prices:history, market:coins   │
└───────────────┴─────────────────────────────────────────────────┘
```

### Core Principles
- **Backend-canonical**: All business data lives in D1. No localStorage fallback for txs/files.
- **Derived portfolio**: Positions, lots, P&L are computed from `state.txs` via FIFO — never stored.
- **Single source of truth**: `CryptoContext.state.txs` is the canonical transaction array. All pages derive from it.
- **Strict Worker URL**: Frontend requires `VITE_WORKER_API_URL` — no hardcoded fallback URLs.

---

## 2. Technology Stack

### Frontend
| Package | Purpose |
|---------|---------|
| `react@18` | UI framework |
| `vite` | Build tool |
| `tailwindcss` + `tailwindcss-animate` | Styling |
| `@clerk/react@6` | Authentication UI |
| `@tanstack/react-query@5` | (available, optional caching) |
| `recharts@2` | Charts (used in some dashboard widgets) |
| `chart.js@4` | Canvas charts |
| `lucide-react` | Icons |
| `react-router-dom@6` | (installed, app uses manual page state) |
| `sonner` | Toast notifications |
| `cmdk` | Command palette |
| `papaparse@5` | CSV parsing |
| `class-variance-authority` | Component variants |
| `clsx` + `tailwind-merge` | Class merging |
| `date-fns@3` | Date utilities |
| `framer-motion` | Animations (optional) |
| `zod@3` | Schema validation |
| All `@radix-ui/*` | Headless UI primitives (dialog, select, tabs, etc.) |

### Backend
| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework for Cloudflare Workers |
| `wrangler` | Cloudflare CLI |

### Infrastructure
| Service | Role |
|---------|------|
| Cloudflare Worker | API server |
| Cloudflare D1 | SQLite database |
| Cloudflare KV | Price cache |
| Clerk | Authentication (RS256 JWT) |

---

## 3. Authentication

### Frontend (Clerk React)

```tsx
// src/main.tsx
import { ClerkProvider } from "@clerk/react";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_...";

root.render(
  <ClerkProvider publishableKey={clerkKey}>
    <App />
  </ClerkProvider>
);
```

```tsx
// src/App.tsx — ClerkRoot component
function ClerkRoot() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <SignInScreen />;  // Uses <SignIn routing="hash" />
  return <AppShell onLogout={() => signOut()} userLabel={user?.primaryEmailAddress?.emailAddress} />;
}
```

### Backend (RS256 JWKS Verification)

```typescript
// backend/src/middleware/auth.ts
// Verifies Clerk RS256 JWTs by fetching JWKS from CLERK_JWKS_URL
// Caches imported CryptoKeys for 1 hour
// Sets c.set("userId", payload.sub) on success
// Returns 401 on missing/invalid/expired tokens
```

**Key functions:**
- `verifyRs256(token, jwksUrl)` — Splits JWT, verifies RS256 signature via `crypto.subtle.verify`
- `getJwksKey(jwksUrl, kid)` — Fetches and caches JWKS, imports RSA keys
- `base64UrlDecode`, `base64UrlToBuffer` — JWT decoding helpers

### Auth Token Flow
1. Frontend: `window.Clerk.session.getToken()` → Bearer token
2. `api.ts`: `setAuthTokenProvider()` wired in `CryptoContext` via `useAuth().getToken`
3. Worker: `authMiddleware` verifies JWT, extracts `sub` as `userId`

---

## 4. Database Schema (D1)

### Core Tables (`seed/schema.sql`)

```sql
-- Assets catalog (public, no auth required for reads)
CREATE TABLE assets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  coingecko_id TEXT,
  binance_symbol TEXT,
  category TEXT DEFAULT 'other',
  precision_qty INTEGER DEFAULT 8,
  precision_price INTEGER DEFAULT 8,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_assets_symbol ON assets(symbol);

-- User transactions (auth required)
CREATE TABLE transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('buy','sell','transfer_in','transfer_out','reward','fee','adjustment')),
  qty REAL NOT NULL,
  unit_price REAL DEFAULT 0,
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  venue TEXT,
  note TEXT,
  tags TEXT,
  source TEXT DEFAULT 'manual',
  external_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_tx_user ON transactions(user_id);
CREATE INDEX idx_tx_user_asset ON transactions(user_id, asset_id);
CREATE INDEX idx_tx_user_ts ON transactions(user_id, timestamp DESC);
CREATE UNIQUE INDEX idx_tx_user_external_id ON transactions(user_id, external_id);

-- Tracking preferences (FIFO/DCA per asset)
CREATE TABLE tracking_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL DEFAULT '__global__',
  tracking_mode TEXT NOT NULL DEFAULT 'fifo',
  UNIQUE(user_id, asset_id)
);

-- Import dedup
CREATE TABLE imported_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  exchange TEXT NOT NULL,
  export_type TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, file_hash)
);

-- User preferences (key-value)
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);

-- Import audit v2
CREATE TABLE import_batches (...);   -- Batch metadata
CREATE TABLE import_rows (...);       -- Per-row audit trail
CREATE TABLE import_row_fingerprints (...); -- Fingerprint dedup
```

### Merchant Tables (`seed/merchant-schema.sql`)

12 tables for the B2B collaboration platform:

```sql
CREATE TABLE merchant_profiles (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL UNIQUE,  -- MRC-XXXXXXXX
  nickname TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  merchant_type TEXT DEFAULT 'independent',  -- independent|desk|partner|other
  region TEXT, default_currency TEXT DEFAULT 'USDT',
  discoverability TEXT DEFAULT 'public',     -- public|merchant_id_only|hidden
  bio TEXT, status TEXT DEFAULT 'active',
  created_at TEXT, updated_at TEXT
);

CREATE TABLE merchant_invites (
  id TEXT PRIMARY KEY,
  from_merchant_id TEXT REFERENCES merchant_profiles(id),
  to_merchant_id TEXT REFERENCES merchant_profiles(id),
  status TEXT DEFAULT 'pending',  -- pending|accepted|rejected|withdrawn|expired
  purpose TEXT, requested_role TEXT DEFAULT 'operator',
  message TEXT, requested_scope TEXT, expires_at TEXT,
  created_at TEXT, updated_at TEXT
);

CREATE TABLE merchant_relationships (
  id TEXT PRIMARY KEY,
  merchant_a_id TEXT REFERENCES merchant_profiles(id),
  merchant_b_id TEXT REFERENCES merchant_profiles(id),
  invite_id TEXT REFERENCES merchant_invites(id),
  relationship_type TEXT DEFAULT 'general',  -- general|lending|arbitrage|capital|strategic
  status TEXT DEFAULT 'active',
  shared_fields TEXT, approval_policy TEXT,
  created_at TEXT, updated_at TEXT
);

CREATE TABLE merchant_roles (
  id TEXT PRIMARY KEY,
  relationship_id TEXT REFERENCES merchant_relationships(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES merchant_profiles(id),
  role TEXT DEFAULT 'viewer'  -- owner|admin|operator|finance|viewer|commenter
);

CREATE TABLE merchant_deals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT REFERENCES merchant_relationships(id),
  deal_type TEXT NOT NULL,  -- lending|arbitrage|partnership|capital_placement
  title TEXT NOT NULL, amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'USDT',
  status TEXT DEFAULT 'draft',  -- draft|active|due|settled|closed|overdue|cancelled
  metadata TEXT, issue_date TEXT, due_date TEXT, close_date TEXT,
  expected_return REAL, realized_pnl REAL,
  created_by TEXT NOT NULL, created_at TEXT, updated_at TEXT
);

CREATE TABLE merchant_settlements (...);
CREATE TABLE merchant_profit_records (...);
CREATE TABLE merchant_approvals (...);
CREATE TABLE merchant_messages (...);
CREATE TABLE merchant_audit_logs (...);
CREATE TABLE merchant_notifications (...);
```

---

## 5. Backend Worker (Hono)

### Entry Point (`backend/src/index.ts`)

```typescript
const app = new Hono<{ Bindings: Env }>();
app.use("*", corsMiddleware);

// Core routes
app.route("/api/assets", assetsRoute);          // GET (public), POST (auth)
app.route("/api/prices", pricesRoute);          // GET (public)
app.route("/api/market-data", marketDataRoute); // GET (public, proxy)
app.route("/api/transactions", transactionsRoute); // CRUD (auth)
app.route("/api/tracking-preferences", trackingRoute);
app.route("/api/imported-files", importedFilesRoute);
app.route("/api/preferences", preferencesRoute);
app.route("/api/import", importRoute);
app.route("/api/fear-greed", fearGreedRoute);
app.route("/api/exchange-sync", exchangeSyncRoute);

// Merchant routes
app.route("/api/merchant", merchantProfilesRoute);
app.route("/api/merchant/invites", merchantInvitesRoute);
app.route("/api/merchant/relationships", merchantRelationshipsRoute);
app.route("/api/merchant/deals", merchantDealsRoute);
app.route("/api/merchant/messages", merchantMessagesRoute);
app.route("/api/merchant/approvals", merchantApprovalsRoute);
app.route("/api/merchant/audit", merchantAuditRoute);
app.route("/api/merchant/notifications", merchantNotificationsRoute);

// Health check
app.get("/api/status", async (c) => { /* reads PRICE_KV */ });

// Scheduled cron
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pollPrices(env));
  },
};
```

### Env Type (`backend/src/types.ts`)

```typescript
export interface Env {
  DB: D1Database;
  PRICE_KV: KVNamespace;
  CLERK_JWKS_URL?: string;
  ALLOWED_ORIGINS?: string;
}
```

### Route Specifications

#### `/api/assets`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | No | List all assets (`SELECT * FROM assets ORDER BY symbol`) |
| `POST /` | Yes | Auto-create asset if not exists (upsert by symbol) |

#### `/api/transactions`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | Yes | List user's transactions (JOIN assets for symbol) |
| `POST /` | Yes | Create single transaction |
| `POST /batch` | Yes | Batch create (up to 500 per chunk, dedup by `external_id`) |
| `PUT /:id` | Yes | Update transaction (ownership verified) |
| `DELETE /:id` | Yes | Delete transaction (ownership verified) |

**Batch create logic:**
- For each tx: `INSERT OR IGNORE` using `(user_id, external_id)` unique index
- Returns `{ created, skippedDuplicates, errors, errorDetails, transactions }`

#### `/api/prices`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | No | Latest prices from KV (`prices:latest`) |
| `GET /history` | No | 24h rolling history from KV (`prices:history`) |

#### `/api/market-data`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | No | Market coin data with 5-source cascading fallback |

**Fallback order:** CoinGecko → CoinCap → CoinPaprika → CryptoCompare → Binance Ticker  
**Cache:** KV `market:coins` with 5-minute TTL

#### `/api/fear-greed`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | No | Fear & Greed Index (proxied from alternative.me, cached in KV) |

#### `/api/exchange-sync`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | Yes | List user's exchange connections |
| `POST /` | Yes | Save exchange connection (API key/secret) |
| `DELETE /:exchange` | Yes | Delete connection |
| `POST /test/:exchange` | Yes | Test connection (fetch 1 trade) |
| `POST /sync/:exchange` | Yes | Sync trades from exchange API |

**Supported exchanges:** Binance, Bybit, OKX, Gate.io, Coinbase, Kraken  
**Security:** HMAC signing done server-side, credentials stored in D1

#### `/api/import`
| Method | Auth | Description |
|--------|------|-------------|
| `POST /lookup` | Yes | Check fingerprints/native IDs for dedup |
| `POST /record` | Yes | Record import batch audit |

#### `/api/preferences`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | Yes | Get all user preferences |
| `PUT /` | Yes | Save preferences (upsert key-value pairs) |

#### `/api/tracking-preferences`
| Method | Auth | Description |
|--------|------|-------------|
| `GET /` | Yes | Get tracking mode (global or per-asset) |
| `PUT /` | Yes | Set tracking mode |

### CORS Middleware (`backend/src/middleware/cors.ts`)

```typescript
function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  // Explicit list from ALLOWED_ORIGINS env var
  // Auto-allow: *.lovableproject.com, *.lovable.app
  // Auto-allow: localhost, 127.0.0.1
}
// Sets Vary: Origin, Access-Control-Max-Age: 86400
// Applies headers in finally{} block so error responses get CORS too
```

### Cron: Price Polling (`backend/src/cron/poll-prices.ts`)

Every 2 minutes:
1. `SELECT id, symbol, binance_symbol FROM assets WHERE binance_symbol IS NOT NULL`
2. Batch fetch from `https://api.binance.com/api/v3/ticker/24hr?symbols=[...]`
3. Build `PriceSnapshot` → store in KV `prices:latest` (TTL 10min)
4. Append `MiniSnapshot` to `prices:history` (rolling 720 points, TTL 25h)

### Wrangler Config (`backend/wrangler.toml`)

```toml
name = "cryptotracker-api"
main = "src/index.ts"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["*/2 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "crypto-tracker"
database_id = "<your-d1-id>"

[[kv_namespaces]]
binding = "PRICE_KV"
id = "<your-kv-id>"
```

---

## 6. Frontend State Management

### CryptoState (`src/lib/cryptoState.ts`)

```typescript
export interface CryptoTx {
  id: string; ts: number; type: string; asset: string; qty: number;
  price: number; total: number; fee: number; feeAsset: string;
  accountId: string; note: string; lots?: string;
}

export interface CryptoState {
  base: string;        // "USD" | "EUR" | "GBP" | "QAR"
  method: string;      // "FIFO" | "DCA"
  txs: CryptoTx[];     // Canonical transactions (from backend)
  lots: CryptoLot[];   // Legacy (unused in FIFO pipeline)
  prices: Record<string, number>;
  pricesTs: number;
  watch: string[];     // Watchlist symbols ["BTC", "ETH", ...]
  alerts: CryptoAlert[];
  connections: CryptoConnection[];
  accounts: { id: string; name: string }[];
  holdings: UserHolding[];
  calendarEntries: CalendarEntry[];
  importedFiles: ImportedFile[];
  layout: string;      // "flux"|"cipher"|"vector"|"aurora"|"carbon"|"prism"|"noir"|"pulse"
  theme: string;       // "t1"|"t2"|"t3"|"t4"|"t5"
  syncStatus?: "idle" | "loading" | "synced" | "error";
  syncError?: string;
}
```

**Storage rules:**
- `loadState()` — reads ONLY UI prefs from localStorage (`base, method, watch, layout, theme, alerts, connections, accounts`)
- `saveState()` — writes ONLY UI prefs to localStorage
- Business data (`txs, importedFiles`) is NEVER persisted locally — hydrated from backend

### CryptoContext (`src/lib/cryptoContext.tsx`)

```typescript
interface CryptoCtx {
  state: CryptoState;
  setState: (updater: (prev: CryptoState) => CryptoState) => void;
  refresh: (force?: boolean) => Promise<void>;
  rehydrateFromBackend: () => Promise<void>;
  toast: (msg: string, type?: string) => void;
  toastMsg: { msg: string; type: string } | null;
}
```

**Hydration flow (on userId change):**
1. `setAuthTokenProvider()` from `useAuth().getToken`
2. Parallel fetch: `getAssetCatalog()`, `fetchTransactions()`, `fetchImportedFiles()`, `fetchUserPreferences()`
3. `mapTransactions()` — converts `ApiTransaction[]` to `CryptoTx[]` using asset catalog
4. `runMigration()` — one-time localStorage → D1 migration (idempotent via `external_id`)
5. Sync preferences to backend on change (debounced 1s)

### Formatting Functions

```typescript
fmtFiat(n: number, cur?: string): string   // "1,234.56"
fmtTotal(n: number): string                 // "1,235" (no decimals)
fmtQty(n: number): string                   // 6-8 decimal places
fmtPx(n: number): string                    // 2-6 decimal places based on magnitude
```

---

## 7. Core Libraries

### API Client (`src/lib/api.ts`)

```typescript
const WORKER_BASE = resolveWorkerBase(import.meta.env.VITE_WORKER_API_URL);
// NO hardcoded fallback — empty string if unconfigured

export function isWorkerConfigured(): boolean;
export async function isWorkerAvailable(): Promise<boolean>; // cached 5s
export async function ensureWriteReady(): Promise<void>;     // throws if not ready

// Operations
export async function fetchAssets(): Promise<ApiAsset[]>;
export async function createAsset(input): Promise<{ asset, created }>;
export async function fetchTransactions(): Promise<ApiTransaction[]>;
export async function createTransaction(input): Promise<ApiTransaction>;
export async function updateTransaction(id, updates): Promise<ApiTransaction>;
export async function deleteTransaction(id): Promise<void>;
export async function batchCreateTransactions(txs): Promise<BatchCreateResult>;
export async function fetchPrices(): Promise<{ prices, ts, stale }>;
export async function fetchTrackingPreference(assetId?): Promise<...>;
export async function setTrackingPreference(mode, assetId?): Promise<...>;
export async function fetchImportedFiles(): Promise<any[]>;
export async function createImportedFile(input): Promise<any>;
export async function lookupImportRows(input): Promise<ImportLookupResponse>;
export async function recordImportBatch(input): Promise<{ ok, batch_id }>;
export async function fetchUserPreferences(): Promise<Record<string, string>>;
export async function saveUserPreferences(prefs): Promise<void>;
```

### Merchant API Client (`src/lib/merchantApi.ts`)

```typescript
// Profile
fetchMyProfile(), createProfile(data), updateProfile(data),
fetchProfile(merchantId), searchMerchants(q), checkNickname(nick)

// Invites
sendInvite(data), fetchInbox(), fetchSentInvites(),
acceptInvite(id), rejectInvite(id, reason?), withdrawInvite(id)

// Relationships
fetchRelationships(), fetchRelationship(id),
updateRelSettings(id, data), suspendRelationship(id), terminateRelationship(id)

// Deals
fetchDeals(relId?), createDeal(data), updateDeal(id, data),
submitSettlement(dealId, data), recordProfit(dealId, data), closeDeal(dealId, data?)

// Messages
fetchMessages(relId, limit?, offset?), sendMessage(relId, body)

// Approvals
fetchApprovalInbox(), fetchSentApprovals(),
approveRequest(id, note?), rejectRequest(id, note?)

// Audit
fetchRelAudit(relId), fetchMyActivity()

// Notifications
fetchNotifications(limit?), fetchUnreadCount(),
markNotificationRead(id), markAllRead()
```

### Portfolio Derivation (`src/lib/derivePortfolio.ts`)

```typescript
// FIFO lot-based portfolio calculation — PURE function, no side effects

interface DerivedLot {
  id: string; ts: number; asset: string;
  qty: number; qtyRem: number; unitCost: number; tag: string;
}

interface DerivedPosition {
  sym: string; qty: number; cost: number;
  price: number | null; mv: number | null; unreal: number | null;
  avg: number; lots: DerivedLot[]; realizedPnl: number; txCount: number;
}

interface PortfolioSummary {
  positions: DerivedPosition[];
  totalMV: number; totalCost: number; totalPnl: number;
  totalPnlPct: number; realizedPnl: number;
  assetCount: number; txCount: number;
}

// FIFO logic
function runFifo(txs: CryptoTx[]): FifoState {
  // Sort by timestamp ascending
  // IN types: buy, reward, transfer_in, deposit → create lot
  // OUT types: sell, transfer_out, withdrawal, fee → consume lots FIFO
  // Adjustment: positive qty = IN, negative = OUT
  // Sell: realized P&L = proceeds - cost consumed
}

export function derivePortfolio(txs, getPrice): PortfolioSummary;
export function deriveRealizedByTx(txs): Map<string, number>;
```

### Symbol Resolution (`src/lib/symbolAliases.ts`)

```typescript
// Aliases: XBT→BTC, BCHABC→BCH, RNDR→RENDER, etc.
export function normalizeSymbol(raw: string): string;
  // Uppercase, strip leading digits ("1000PEPE"→"PEPE"), apply alias

export function extractBaseFromPair(pair: string): string;
  // "BTCUSDT"→"BTC", "ETH/USDT"→"ETH", "SOL-PERP"→"SOL"
  // Strip known quote currencies: USDT, USDC, BUSD, BTC, ETH, BNB, USD, etc.

export function matchAssetBySymbol(sym, assets): string | null;
  // Match by symbol or binance_symbol, return asset ID
```

### Asset Resolver (`src/lib/assetResolver.ts`)

```typescript
export async function getAssetCatalog(force?): Promise<ApiAsset[]>;
  // Cached for 60s, fetches from /api/assets

export function resolveAssetSymbol(raw): string;
  // extractBaseFromPair → normalizeSymbol

export function resolveAssetId(raw, assets): { assetId, symbol };
  // Resolve to D1 asset ID

export async function resolveOrCreateAsset(raw): Promise<{ assetId, symbol }>;
  // Auto-creates asset via POST /api/assets if missing
```

### Migration (`src/lib/migration.ts`)

```typescript
export async function runMigration(): Promise<MigrationResult | null>;
  // One-time: reads hasLegacyData() from localStorage
  // Builds CreateTransactionInput[] with deterministic external_id: "migration:..."
  // Batch creates via batchCreateTransactions (500 per chunk)
  // Migrates imported files
  // Calls markMigrationComplete() to prevent re-runs
```

---

## 8. Hooks

### `useUnifiedPortfolio()` → `PortfolioSummary`

Single hook for all portfolio data. Reads `state.txs`, applies `usePortfolioPriceGetter()`, returns `derivePortfolio()` result.

```typescript
export function useUnifiedPortfolio(): PortfolioSummary & {
  base: string; method: string;
  getPosition: (sym: string) => DerivedPosition | undefined;
};
```

### `usePortfolioPriceGetter()` → `(sym: string) => number | null`

Priority: Binance WS/REST spot → CoinGecko live → cached state prices → null

### `useLivePrices()` → Market data + spot prices

```typescript
export function useLivePrices(): {
  coins: LiveCoin[];                          // CoinGecko market data (top 500)
  loading: boolean;
  getPrice: (sym: string) => LiveCoin | null; // Merged WS + CG
  priceMap: Map<string, LiveCoin>;
  spotPrices: Record<string, SpotPrice>;      // Binance WS/REST
};
```

**Internal architecture:**
1. **Market data polling** — module-level singleton with exponential backoff
   - Worker proxy (`/api/market-data`) → CoinGecko direct → CoinCap → Binance ticker
   - Cached in localStorage (`lt_market_cache`) for cross-reload resilience
   - Poll every 3min (backoff to 10min on failures)
2. **Binance REST bootstrap** — `getSpotPrices()` for user's assets on mount
3. **Binance WebSocket** — `subscribeLivePrices()` singleton, auto-reconnect

### `useLedgerMutations()` → Write operations

```typescript
export type WriteStatus = "checking" | "ready" | "unavailable" | "unconfigured";

export function useLedgerMutations(): {
  writeStatus: WriteStatus;
  checkWriteStatus: () => Promise<void>;
  createManualTransaction: (params) => Promise<MutationResult>;
  updateLedgerTransaction: (txId, updates) => Promise<MutationResult>;
  deleteLedgerTransaction: (txId) => Promise<MutationResult>;
  commitImportedTransactions: (params) => Promise<ImportMutationResult>;
};
```

All mutations: `ensureWriteReady()` → API call → `rehydrateFromBackend()`

### `useSparklineData(coinIds)` → `Map<string, number[]>`

Fetches 7-day sparklines from CoinGecko. Rate-limited (1.5s between requests), capped at 20 coins.

---

## 9. Pages

### Dashboard (`src/pages/DashboardPage.tsx`)

**Cards (draggable order, persisted in localStorage):**
| Card ID | Content |
|---------|---------|
| `kpis` | 3-column KPI grid: Unrealized P&L, Realized P&L, Total Cost |
| `allocation` | Donut chart (SVG) — top 12 coins + "Other" |
| `heatmap` | 3×3 grid — top 9 positions by MV, color-coded by P&L% |
| `fearGreed` | SVG gauge — Fear & Greed Index from alternative.me (via Worker) |
| `movers` | Top 3 gainers + 3 losers by P&L% |
| `watchlist` | Watched coins with price, 24h%, 7d% |
| `benchmark` | Portfolio vs BTC/ETH benchmarks (1D/7D/30D/3M/1Y) — SVG chart |
| `riskBreakdown` | Per-asset volatility, HHI concentration, VaR/CVaR (95%) |
| `positions` | Table: top positions with price, value, avg buy, P&L |

**Features:**
- Drag-and-drop card reordering (HTML5 drag API)
- Edit mode toggle for card management
- DonutChart (pure SVG), DonutLegend, HeatmapBlock sub-components

### Portfolio (`src/pages/PortfolioPage.tsx`)

**Views:**
- **DCA View** — aggregated positions table
- **Lot View** — expandable rows showing individual FIFO lots

**Table columns (configurable, draggable order):**
`#, Asset, Amount, Price Graph, 1h%, 24h%, 7d%, Price, Value, Allocation%, Avg Buy, Avg Sell, P/L, Profit%, Realized P/L, Market Cap, Volume 24h`

**Features:**
- Column visibility toggle + drag reorder (persisted in localStorage)
- Asset filter (multi-select)
- Sortable columns (click header)
- Sparkline charts (7-day, from CoinGecko)
- Mobile card layout (responsive)
- Asset drilldown on click → `AssetDrilldown` component
- Compact KPI header: Portfolio Value, Total P&L, Total Cost

### Markets (`src/pages/MarketsPage.tsx`)

**Views:**
- **Table** — full market table with search, sort, pagination
- **Watchlist** — filtered to watched coins only
- **Bubbles** — `BubbleCanvas` component (canvas-based bubble visualization)
- **Heatmap** — `HeatmapGrid` component (treemap-style grid)

**Controls:**
- View mode toggle (Table/Watchlist/Bubbles/Heatmap)
- Time range (1H/24H/7D)
- Coin count (Top 100/250/500)
- Market stats header (total market cap, 24h volume, BTC dominance)

### Ledger (`src/pages/LedgerPage.tsx`)

**Tabs:**
| Tab | Content |
|-----|---------|
| `journal` | Searchable/filterable transaction table with inline edit/delete |
| `add` | Manual transaction form (type, asset, qty, price, fee, venue, note) |
| `import` | CSV upload → preview → commit pipeline |
| `connect` | Exchange API connections (`ExchangeConnect` component) |

**Stats bar:** Total txs, Unique assets, Buys, Sells, Total Buy Value, Total Sell Value

**Import pipeline:**
1. Upload CSV → `importCSV()` (parse + detect exchange)
2. Delta check via `lookupImportRows()` (backend fingerprint lookup)
3. Preview table with status badges (new/alreadyImported/warning/invalid)
4. Commit via `commitImportedTransactions()` (batch create + file record)

**Write status banner:** Shows unconfigured/unavailable/checking states with retry button

### Calendar (`src/pages/CalendarPage.tsx`)

**Features:**
- Monthly calendar grid with P&L coloring (green=profit, red=loss)
- Per-coin filtering (multi-select)
- Monthly stats: Monthly P&L, Active Days, Total Entries
- Day drilldown: trade details table with asset, type, qty, P&L
- Navigation: Previous/Next month, Today button

**P&L calculation:**
- Buy: `(currentPrice - buyPrice) * qty` (unrealized)
- Sell: realized P&L from `deriveRealizedByTx()`
- Fee: negative absolute

### Merchant (`src/pages/MerchantPage.tsx`)

**10 tabs:** Overview, Directory, Invites, Relationships, Deals, Messages, Approvals, Notifications, Audit, Settings

**Onboarding flow:**
1. If no profile: show `MerchantOnboarding` form
2. Nickname availability check (real-time via `checkNickname()`)
3. Fields: display_name, nickname, type, region, discoverability, bio
4. Merchant ID auto-generated server-side (MRC-XXXXXXXX)

**Overview:** Profile card + KPI stats (active rels, deals, exposure, realized P&L, unread)

**Directory:** Search merchants → send invite modal (purpose + message)

**Invites:** Inbox/Sent toggle, accept/reject/withdraw actions

**Relationships:** List with counterparty info, status badges, click to view detail

**Deals:** List deals, create new deal form, deal lifecycle management
- Types: Lending, Arbitrage, Partnership, Capital Placement
- Status flow: draft → active → due → settled/closed
- Settlement submission, profit recording, deal close (all create approval requests)

**Messages:** Real-time-style chat per relationship (polling-based)

**Approvals:** Inbox/Sent, approve/reject with notes

**Notifications:** List with category badges, mark read/mark all read

**Audit:** Activity log per relationship or own activity

---

## 10. Components

### Layout Components

#### `Sidebar` (`src/components/Sidebar.tsx`)
- Navigation buttons with SVG icons and sub-labels
- Pages: Dashboard, Portfolio, Merchant, Markets, Ledger, Calendar, Settings
- Alert count badge on Settings
- Sign Out button at bottom

#### `Topbar` (`src/components/Topbar.tsx`)
- Page title + subtitle
- `ZenModeButton` toggle
- `CommandPalette` (⌘K)

#### `CommandPalette` (`src/components/CommandPalette.tsx`)
- Uses `cmdk` library
- Quick navigation to any page
- Keyboard shortcut: ⌘K / Ctrl+K

### Dashboard Components

#### `FearGreedGauge` — SVG gauge with needle, color-coded arc, 30-day trend sparkline
#### `BenchmarkChart` — Multi-series SVG comparison chart (Portfolio vs BTC vs ETH)
#### `PerAssetRiskBreakdown` — Volatility table with VaR/CVaR, HHI concentration index
#### `ZenModeToggle` — Hides sensitive financial data

### Portfolio Components

#### `Sparkline` (`src/components/portfolio/Sparkline.tsx`) — SVG mini chart
#### `AssetFilter` (`src/components/portfolio/AssetFilter.tsx`) — Multi-select dropdown
#### `AssetDrilldown` (`src/components/AssetDrilldown.tsx`) — Modal with position details

### Markets Components

#### `MarketStats` — Total market cap, volume, BTC dominance cards
#### `MarketTable` — Full sortable/searchable table with sparklines, watchlist toggle, configurable columns
#### `BubbleCanvas` — Canvas-based bubble chart (size = market cap, color = change%)
#### `HeatmapGrid` — Treemap-style grid showing market sectors

### Ledger Components

#### `CoinAutocomplete` (`src/components/CoinAutocomplete.tsx`) — Asset search with autocomplete
#### `ExchangeConnect` (`src/components/ledger/ExchangeConnect.tsx`)
- Exchange list: Binance, Bybit, OKX, Gate.io, Coinbase, Kraken
- Connect form with API key/secret/passphrase inputs
- Test connection, Sync trades, Sync All, Auto-sync scheduling
- Per-exchange connection status and sync results

### UI Components (shadcn/ui)

Full set of Radix-based primitives: accordion, alert-dialog, avatar, badge, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip.

---

## 11. Import Pipeline

### CSV Parsing (`src/lib/importers/csv.ts`)

```typescript
export function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] };
export async function hashFile(content: string): Promise<string>;  // SHA-256
export async function hashString(s: string): Promise<string>;
```

### Exchange Detection (`src/lib/importers/detector.ts`)

Header-based signature matching with confidence scoring (0-1):
- **Binance:** `Date(UTC), Pair, Side, Price` or `Date(UTC), Market, Type, Price, Amount, Total, Fee, Fee Coin`
- **Bybit:** `Symbol, Side, TradeTime` or `Symbol, Side, Trading Time`
- **OKX:** `Instrument ID` or `instrument_id`
- **Gate.io:** `pair` or `Pair, Side`
- **MEXC:** `Pairs, Side` or `Trading Pair, Direction`
- **KuCoin:** `tradeCreatedAt, symbol, side` or `Symbol, Side, Trade Time`

**Rejection patterns:** futures, perpetual, margin, options, earn, staking, p2p, copy trading, deposits, withdrawals

### Exchange Adapters

Each adapter (`src/lib/importers/{exchange}.ts`) implements:
```typescript
function parse(rows: Record<string, string>[]): {
  parsed: NormalizedRow[];
  skipped: SkippedRow[];
};
```

Maps exchange-specific CSV columns to `NormalizedRow`:
```typescript
interface NormalizedRow {
  sourceRowIndex: number;
  timestamp: number;      // unix ms
  exchange: Exchange;
  symbol: string;         // e.g. BTCUSDT
  side: "buy" | "sell";
  qty: number;
  unitPrice: number;
  grossValue: number;
  feeAmount: number;
  feeAsset: string;
  tradeId: string;
  orderId: string;
  txHash: string;
  externalId: string;
  raw: Record<string, string>;
}
```

### Import Orchestrator (`src/lib/importers/index.ts`)

```typescript
export async function importCSV(fileContent, fileName, opts?): Promise<ParseResult>;
// 1. parseCSV()
// 2. detectExchange()
// 3. Run adapter → NormalizedRow[]
// 4. toCanonical() → CanonicalTransactionRow[]
// 5. fingerprintForRow() → deterministic hash
// 6. validateCanonical() → status assignment
// 7. In-file duplicate detection
// Returns ParseResult with ImportPreviewRow[]

export function applyLookup(rows, lookup): ImportPreviewRow[];
// Marks rows as alreadyImported/conflict based on backend lookup
```

### Fingerprinting

Priority fingerprint construction:
```
{exchange}:{export_type}:native:{tradeId|orderId|txHash}
// OR (if no native ID):
{exchange}:{export_type}:composite:{timestamp}:{type}:{side}:{symbol}:{base}:{quote}:{qty}:{price}:{fee}:{feeAsset}
```
Hashed with SHA-256 for storage/comparison.

---

## 12. Price System

### Three-Layer Architecture

```
Layer 1: Binance WebSocket (real-time ticks, ~100ms latency)
  └─ subscribeLivePrices() → _wsPrices map
  └─ Auto-reconnect on close (5s delay)

Layer 2: Binance REST (bootstrap on mount)
  └─ getSpotPrices() → batch ticker API
  └─ CoinGecko fallback for non-Binance assets

Layer 3: CoinGecko Market Data (3-min polling)
  └─ Worker proxy (/api/market-data) → cascading fallback
  └─ localStorage cache (lt_market_cache, 30min TTL)
```

### Price Provider (`src/lib/priceProvider.ts`)

```typescript
// 140+ symbol mappings
export const BINANCE_SYMBOLS: Record<string, string>;  // "BTC" → "BTCUSDT"
export const KNOWN_IDS: Record<string, string>;         // "BTC" → "bitcoin"

export interface SpotPrice {
  price: number; change24h: number; ts: number;
  stale: boolean; source: "binance" | "coingecko";
}

export async function getSpotPrices(assets): Promise<Record<string, SpotPrice>>;
export function subscribeLivePrices(symbols, callback): () => void;  // unsubscribe
export function getWsPrices(): Record<string, SpotPrice>;
export async function getDailyHistory(coingeckoId, days): Promise<{ day, price }[]>;
export async function searchCoins(query): Promise<{ id, symbol, name, thumb }[]>;
```

### Market Data Polling (module-level singleton in `useLivePrices.ts`)

```typescript
// Exponential backoff on failures
const BASE_POLL_MS = 180_000;  // 3 min
const MAX_POLL_MS = 600_000;   // 10 min max
let _consecutiveFailures = 0;

// setTimeout-based scheduling (not setInterval)
function scheduleNextPoll() { /* uses getNextPollDelay() */ }
```

---

## 13. Merchant Platform

### Backend Routes

#### Profiles (`/api/merchant`)
- `GET /profile/me` — Get own profile
- `POST /profile` — Create profile (generates `MRC-XXXXXXXX` ID)
- `PATCH /profile/me` — Update profile
- `GET /profile/:id` — Get profile by ID
- `GET /search?q=` — Search by nickname/merchant_id
- `GET /check-nickname?nickname=` — Check availability

#### Invites (`/api/merchant/invites`)
- `POST /` — Send invite
- `GET /inbox` — Received invites
- `GET /sent` — Sent invites
- `POST /:id/accept` — Accept (creates relationship + roles)
- `POST /:id/reject` — Reject
- `POST /:id/withdraw` — Withdraw

#### Relationships (`/api/merchant/relationships`)
- `GET /` — List relationships (with counterparty info)
- `GET /:id` — Detail with roles + deal summary
- `PATCH /:id/settings` — Update settings
- `POST /:id/suspend` — Suspend (creates approval)
- `POST /:id/terminate` — Terminate (creates approval)

#### Deals (`/api/merchant/deals`)
- `GET /` — List deals (optional `?relationship_id=`)
- `POST /` — Create deal
- `PATCH /:id` — Update deal
- `POST /:id/submit-settlement` — Submit settlement (creates approval)
- `POST /:id/record-profit` — Record profit (creates approval)
- `POST /:id/close` — Close deal (creates approval)

#### Messages (`/api/merchant/messages`)
- `GET /:relId/messages?limit=&offset=` — List messages
- `POST /:relId/messages` — Send message

#### Approvals (`/api/merchant/approvals`)
- `GET /inbox` — Pending approvals for me
- `GET /sent` — My submitted approvals
- `POST /:id/approve` — Approve with note
- `POST /:id/reject` — Reject with note

#### Audit (`/api/merchant/audit`)
- `GET /relationship/:relId` — Audit log for relationship
- `GET /activity` — My activity

#### Notifications (`/api/merchant/notifications`)
- `GET /?limit=` — List notifications
- `GET /count` — Unread count
- `POST /:id/read` — Mark read
- `POST /read-all` — Mark all read

### Data Flow

```
Create Profile → Search Directory → Send Invite
       ↓                                    ↓
  Overview Tab                        Accept Invite
                                          ↓
                                  Create Relationship
                                     ↓         ↓
                              Create Deal   Send Message
                                  ↓
                          Submit Settlement / Record Profit
                                  ↓
                          Approval Request Created
                                  ↓
                     Counterparty Approves/Rejects
                                  ↓
                          Deal Status Updated
                                  ↓
                       Audit Log + Notification Created
```

---

## 14. Styling & Theming

### Layout System

8 layouts applied via `data-layout` attribute on `<body>`:
`flux, cipher, vector, aurora, carbon, prism, noir, pulse`

Each layout customizes:
- `--lt-radius`, `--lt-radius-sm` (border radius)
- `--app-font` (typography)
- Panel backgrounds, border styles

### Theme System

5 themes applied via `data-theme` attribute:
`t1, t2, t3, t4, t5`

CSS variables set per theme:
```css
--bg, --panel, --panel2, --line, --text,
--muted, --muted2, --brand, --good, --bad, --warn
```

### CSS Architecture

- `src/index.css` — Design tokens, theme definitions, component styles
- `src/responsive-overrides.css` — Mobile/tablet overrides
- `tailwind.config.ts` — Semantic tokens mapped to CSS variables

### Key CSS Classes

```css
.app          — Main layout grid (sidebar + mainWrap)
.sidebar      — Fixed left navigation
.mainWrap     — Content area
.scroll       — Scrollable page content
.topbar       — Page header
.panel        — Card container
.panel-head   — Card header (flex, space-between)
.panel-body   — Card content
.kpis         — KPI grid
.kpi-card     — KPI card
.kpi-val      — KPI value (with .good/.bad color)
.btn          — Button (.primary, .secondary, .tiny)
.inputBox     — Input field
.tableWrap    — Scrollable table container
.mono         — Monospace font
.muted        — Muted text color
.good/.bad    — Green/red semantic colors
.pill         — Tag/badge
.cal-grid     — Calendar grid (7 columns)
.cal-day      — Calendar day cell (.has-profit, .has-loss, .today, .selected)
.seg          — Segmented control group
.market-controls — Markets page toolbar
```

---

## 15. Environment & Deployment

### Frontend Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `VITE_WORKER_API_URL` | Yes | Worker API base URL (no trailing slash) |

### Backend Secrets

| Secret | Description |
|--------|-------------|
| `CLERK_JWKS_URL` | `https://<clerk-domain>/.well-known/jwks.json` |
| `ALLOWED_ORIGINS` | Comma-separated frontend URLs |

### Deployment

**Frontend:** Lovable (auto-deploy) or any static hosting (Cloudflare Pages, Vercel, Netlify)

**Backend:**
```bash
cd backend
npm install
npx wrangler d1 create crypto-tracker
npx wrangler kv namespace create PRICE_KV
# Update wrangler.toml with IDs
npm run db:init:remote   # applies seed/schema.sql + seed/assets.sql
npx wrangler secret put CLERK_JWKS_URL
npx wrangler secret put ALLOWED_ORIGINS
npm run deploy           # npx wrangler deploy
```

### Database Initialization

```bash
# Two-stage init
npx wrangler d1 execute crypto-tracker --remote --file=seed/schema.sql
npx wrangler d1 execute crypto-tracker --remote --file=seed/assets.sql
# Merchant platform
npx wrangler d1 execute crypto-tracker --remote --file=seed/merchant-schema.sql
```

---

## 16. File Structure

```
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Worker entry, routes, cron
│   │   ├── types.ts                    # Env + D1 row types
│   │   ├── middleware/
│   │   │   ├── auth.ts                 # RS256 JWT verification
│   │   │   └── cors.ts                 # Dynamic CORS
│   │   ├── routes/
│   │   │   ├── assets.ts               # Asset CRUD
│   │   │   ├── transactions.ts         # Transaction CRUD + batch
│   │   │   ├── prices.ts               # KV price reads
│   │   │   ├── market-data.ts          # Multi-source market proxy
│   │   │   ├── fear-greed.ts           # F&G index proxy
│   │   │   ├── exchange-sync.ts        # Exchange API sync
│   │   │   ├── import.ts               # Import audit/lookup
│   │   │   ├── imported-files.ts       # File dedup records
│   │   │   ├── tracking.ts             # Tracking preferences
│   │   │   ├── preferences.ts          # User preferences
│   │   │   ├── merchant-profiles.ts    # Merchant profiles
│   │   │   ├── merchant-invites.ts     # Invite workflow
│   │   │   ├── merchant-relationships.ts
│   │   │   ├── merchant-deals.ts       # Deal lifecycle
│   │   │   ├── merchant-messages.ts    # Chat messages
│   │   │   ├── merchant-approvals.ts   # Approval workflow
│   │   │   ├── merchant-audit.ts       # Audit logs
│   │   │   └── merchant-notifications.ts
│   │   └── cron/
│   │       └── poll-prices.ts          # Binance price polling
│   ├── wrangler.toml                   # Worker config
│   ├── package.json
│   └── test-local.sh                   # Smoke tests
│
├── seed/
│   ├── schema.sql                      # Core D1 tables
│   ├── assets.sql                      # Asset catalog seed data
│   ├── merchant-schema.sql             # Merchant platform tables
│   ├── merchant-seed-data.sql          # Test merchant profiles
│   └── merchant-full-cycle.sql         # Test fixtures (invites, deals, etc.)
│
├── src/
│   ├── main.tsx                        # ClerkProvider → App
│   ├── App.tsx                         # Auth gate → CryptoProvider → AppShell
│   ├── App.css                         # Legacy styles
│   ├── index.css                       # Design system tokens + themes
│   ├── responsive-overrides.css        # Mobile overrides
│   │
│   ├── lib/
│   │   ├── api.ts                      # Worker API client (strict, no fallback)
│   │   ├── merchantApi.ts              # Merchant API client
│   │   ├── cryptoState.ts              # State types + load/save (UI only)
│   │   ├── cryptoContext.tsx            # React context + backend hydration
│   │   ├── derivePortfolio.ts          # FIFO portfolio derivation
│   │   ├── portfolioCalculations.ts    # Additional calc helpers
│   │   ├── priceProvider.ts            # Binance WS/REST + CoinGecko
│   │   ├── assetResolver.ts            # Symbol → asset ID resolution
│   │   ├── symbolAliases.ts            # Symbol normalization
│   │   ├── migration.ts                # localStorage → D1 migration
│   │   ├── utils.ts                    # Tailwind cn() helper
│   │   └── importers/
│   │       ├── index.ts                # Import orchestrator
│   │       ├── types.ts                # Import system types
│   │       ├── detector.ts             # Exchange detection
│   │       ├── csv.ts                  # CSV parser + hash
│   │       ├── binance.ts              # Binance adapter
│   │       ├── bybit.ts                # Bybit adapter
│   │       ├── okx.ts                  # OKX adapter
│   │       ├── gate.ts                 # Gate.io adapter
│   │       ├── mexc.ts                 # MEXC adapter
│   │       └── kucoin.ts               # KuCoin adapter
│   │
│   ├── hooks/
│   │   ├── useUnifiedPortfolio.ts      # Portfolio derivation hook
│   │   ├── usePortfolioPriceGetter.ts  # Price getter (WS→REST→CG)
│   │   ├── useLivePrices.ts            # Market data + spot prices
│   │   ├── useLedgerMutations.ts       # Backend write operations
│   │   ├── useSparklineData.ts         # 7-day sparkline data
│   │   ├── usePortfolio.ts             # Legacy portfolio hook
│   │   └── use-mobile.tsx              # Mobile breakpoint detection
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx           # KPIs, allocation, heatmap, watchlist
│   │   ├── PortfolioPage.tsx           # Holdings table, lot view
│   │   ├── MerchantPage.tsx            # B2B collaboration hub
│   │   ├── MarketsPage.tsx             # Live market data
│   │   ├── LedgerPage.tsx              # Transactions, import, connect
│   │   ├── CalendarPage.tsx            # Monthly P&L calendar
│   │   ├── SettingsPage.tsx            # (excluded from this doc)
│   │   ├── Index.tsx                   # Landing/redirect
│   │   └── NotFound.tsx                # 404
│   │
│   ├── components/
│   │   ├── Sidebar.tsx                 # Navigation sidebar
│   │   ├── Topbar.tsx                  # Page header
│   │   ├── CommandPalette.tsx          # ⌘K search
│   │   ├── GlobalSearch.tsx            # Global search
│   │   ├── NavLink.tsx                 # Navigation link
│   │   ├── CoinAutocomplete.tsx        # Asset search autocomplete
│   │   ├── AssetDrilldown.tsx          # Position detail modal
│   │   │
│   │   ├── dashboard/
│   │   │   ├── FearGreedGauge.tsx      # F&G Index SVG gauge
│   │   │   ├── BenchmarkChart.tsx      # Portfolio vs benchmarks
│   │   │   ├── PerAssetRiskBreakdown.tsx  # Volatility + VaR
│   │   │   ├── HistoricalNetValue.tsx  # (excluded from dashboard)
│   │   │   ├── ValueDistribution.tsx   # (excluded from dashboard)
│   │   │   ├── EventsAnalysis.tsx      # (excluded from dashboard)
│   │   │   └── ZenModeToggle.tsx       # Hide sensitive data
│   │   │
│   │   ├── portfolio/
│   │   │   ├── Sparkline.tsx           # SVG sparkline chart
│   │   │   └── AssetFilter.tsx         # Multi-select filter
│   │   │
│   │   ├── markets/
│   │   │   ├── MarketStats.tsx         # Market overview stats
│   │   │   ├── MarketTable.tsx         # Full market table
│   │   │   ├── BubbleCanvas.tsx        # Canvas bubble chart
│   │   │   └── HeatmapGrid.tsx         # Treemap heatmap
│   │   │
│   │   ├── ledger/
│   │   │   └── ExchangeConnect.tsx     # Exchange API management
│   │   │
│   │   └── ui/                         # shadcn/ui components (40+)
│   │
│   └── integrations/supabase/          # Legacy (unused, kept for types)
│       ├── client.ts
│       └── types.ts
│
├── index.html                          # Vite entry
├── tailwind.config.ts                  # Tailwind + semantic tokens
├── vite.config.ts                      # Vite config
├── tsconfig.json                       # TypeScript config
└── package.json                        # Frontend dependencies
```

---

## Appendix A: Key Interfaces Quick Reference

```typescript
// API types
interface ApiAsset { id, symbol, name, category, coingecko_id, binance_symbol, precision_qty, precision_price }
interface ApiTransaction { id, user_id, asset_id, timestamp, type, qty, unit_price, fee_amount, fee_currency, venue, note, tags, source, external_id }
interface ApiPriceEntry { price, change_1h, change_24h, change_7d, market_cap, volume_24h, ts }
interface BatchCreateResult { created, skippedDuplicates, errors, errorDetails, transactions }

// State types
interface CryptoTx { id, ts, type, asset, qty, price, total, fee, feeAsset, accountId, note }
interface CryptoState { base, method, txs, lots, prices, pricesTs, watch, alerts, connections, accounts, holdings, calendarEntries, importedFiles, layout, theme, syncStatus, syncError }

// Portfolio types
interface DerivedLot { id, ts, asset, qty, qtyRem, unitCost, tag }
interface DerivedPosition { sym, qty, cost, price, mv, unreal, avg, lots, realizedPnl, txCount }
interface PortfolioSummary { positions, totalMV, totalCost, totalPnl, totalPnlPct, realizedPnl, assetCount, txCount }

// Price types
interface SpotPrice { price, change24h, ts, stale, source }
interface LiveCoin { id, symbol, name, current_price, market_cap, total_volume, market_cap_rank, image, price_change_percentage_1h/24h/7d }
interface PriceSnapshot { prices: Record<string, PriceEntry>, ts }

// Import types
interface NormalizedRow { sourceRowIndex, timestamp, exchange, symbol, side, qty, unitPrice, grossValue, feeAmount, feeAsset, tradeId, orderId, txHash, externalId, raw }
interface ImportPreviewRow extends CanonicalTransactionRow { fingerprint, fingerprintHash, nativeId, status, message }
interface ParseResult { detection, exchange, exportType, rows, warnings, dateRange, rowCount, skippedCount }

// Merchant types
interface MerchantProfile { id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status }
interface MerchantRelationship { id, merchant_a_id, merchant_b_id, relationship_type, status, my_role }
interface MerchantDeal { id, relationship_id, deal_type, title, amount, currency, status, expected_return, realized_pnl }
interface MerchantApproval { id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status }

// Worker env
interface Env { DB: D1Database, PRICE_KV: KVNamespace, CLERK_JWKS_URL?: string, ALLOWED_ORIGINS?: string }
```

---

*Document generated: 2026-03-10. Covers all pages except Settings.*
