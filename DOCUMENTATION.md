# CoinCompass / CryptoTracker — Complete Technical Documentation

> **Version**: 2.0  
> **Last Updated**: 2026-03-09  
> **Purpose**: Comprehensive reference for rebuilding or extending the application from scratch.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Authentication](#3-authentication)
4. [Database Schema (Cloudflare D1)](#4-database-schema-cloudflare-d1)
5. [Backend API (Cloudflare Worker)](#5-backend-api-cloudflare-worker)
6. [Frontend Application](#6-frontend-application)
7. [Pages & Features](#7-pages--features)
8. [State Management](#8-state-management)
9. [Price System](#9-price-system)
10. [CSV Import Pipeline](#10-csv-import-pipeline)
11. [Exchange API Sync](#11-exchange-api-sync)
12. [Portfolio Derivation Engine](#12-portfolio-derivation-engine)
13. [Theming & Layout System](#13-theming--layout-system)
14. [Configuration & Environment](#14-configuration--environment)
15. [Deployment](#15-deployment)
16. [File Structure Reference](#16-file-structure-reference)
17. [Key Interfaces & Types](#17-key-interfaces--types)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vite + React)                   │
│  Clerk Auth │ CryptoContext │ Live Prices │ FIFO Engine     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (Bearer JWT)
┌──────────────────────▼──────────────────────────────────────┐
│              Cloudflare Worker (Hono)                        │
│  Auth Middleware │ REST API │ Cron Price Poll                │
├─────────────┬───────────────────────────────┬───────────────┤
│  D1 (SQL)   │        KV (Cache)             │  External APIs│
│  - assets   │  - prices:latest              │  - Binance    │
│  - txns     │  - prices:history             │  - CoinGecko  │
│  - imports  │  - market:coins               │  - CoinCap    │
│  - prefs    │  - fear-greed:latest          │  - CoinPaprika│
│  - exchange │                               │  - CryptoComp │
│    _conns   │                               │  - Alt.me FNG │
└─────────────┴───────────────────────────────┴───────────────┘
```

### Core Principles

- **Single source of truth**: Transaction ledger (`state.txs`) is the only canonical data. All portfolio metrics (positions, lots, P&L) are derived at runtime via FIFO.
- **No persistent holdings**: Holdings/lots are never stored; always computed from transactions.
- **Backend-first writes**: All mutations (create/update/delete transactions) go through the Worker API. Frontend never writes directly to any database.
- **localStorage for UI only**: Theme, layout, sidebar collapse, column visibility — never business data.
- **Supabase-free**: The project is 100% Cloudflare-native (D1 + KV + Workers). Supabase packages exist as legacy artifacts but are not used.

---

## 2. Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | UI framework |
| **Vite** | Build tool & dev server |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Component library (Radix UI primitives) |
| **@clerk/react** | Authentication UI |
| **papaparse** | CSV parsing |
| **chart.js / recharts** | Charting (installed, selectively used) |
| **framer-motion** | Animations (available) |
| **react-router-dom** | Routing (installed but app uses SPA tab navigation) |

### Backend
| Technology | Purpose |
|---|---|
| **Cloudflare Workers** | Edge compute runtime |
| **Hono** | Lightweight HTTP framework |
| **Cloudflare D1** | SQLite-compatible relational database |
| **Cloudflare KV** | Key-value cache for prices |
| **Wrangler** | CLI for Worker development & deployment |

### External APIs (No Keys Required)
| API | Usage |
|---|---|
| **Binance REST** | Price bootstrap, ticker polling (cron) |
| **Binance WebSocket** | Real-time price ticks |
| **CoinGecko** | Market data, sparklines, coin search, historical charts |
| **CoinCap** | Fallback market data |
| **CoinPaprika** | Fallback market data |
| **CryptoCompare** | Fallback market data |
| **Alternative.me** | Fear & Greed Index |

---

## 3. Authentication

### Flow
1. Frontend uses **Clerk React** (`<SignIn>`, `<UserButton>`, `useAuth()`, `useUser()`)
2. On sign-in, Clerk issues a **RS256 JWT** session token
3. Frontend attaches `Authorization: Bearer <token>` to all API calls via `src/lib/api.ts`
4. Worker middleware (`backend/src/middleware/auth.ts`) verifies JWT:
   - Fetches public keys from `CLERK_JWKS_URL` (JWKS endpoint)
   - Verifies RS256 signature using Web Crypto API
   - Validates `sub`, `exp`, `nbf` claims
   - Caches RSA keys by `kid` for 60 minutes
   - Sets `c.set('userId', sub)` for downstream handlers

### Sign-In Screen
- `src/App.tsx` → `SignInScreen` component
- Split layout: marketing copy on left, `<SignIn routing="hash" />` on right
- Supports email/password by default; Google/Microsoft if enabled in Clerk dashboard

### Token Provider
```typescript
// src/lib/api.ts
setAuthTokenProvider(async () => {
  return await window.Clerk?.session?.getToken() ?? null;
});
```

---

## 4. Database Schema (Cloudflare D1)

File: `seed/schema.sql`

### `assets`
Master catalog of all known crypto assets.
```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  symbol TEXT NOT NULL,           -- e.g. "BTC"
  name TEXT NOT NULL,             -- e.g. "Bitcoin"
  coingecko_id TEXT,              -- e.g. "bitcoin"
  binance_symbol TEXT,            -- e.g. "BTCUSDT"
  category TEXT DEFAULT 'other',
  precision_qty INTEGER DEFAULT 8,
  precision_price INTEGER DEFAULT 8,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_assets_symbol ON assets(symbol);
```

### `transactions`
Every buy/sell/transfer/reward/fee/adjustment.
```sql
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
  source TEXT DEFAULT 'manual',   -- 'manual' | 'import' | 'exchange_sync'
  external_id TEXT,               -- For dedup (trade ID, migration ID)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_tx_user_external_id ON transactions(user_id, external_id);
```

### `tracking_preferences`
Per-user tracking method (FIFO/DCA).
```sql
CREATE TABLE tracking_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL DEFAULT '__global__',
  tracking_mode TEXT NOT NULL DEFAULT 'fifo',
  UNIQUE(user_id, asset_id)
);
```

### `imported_files`
Tracks which CSV files have been imported (SHA-256 dedup).
```sql
CREATE TABLE imported_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,        -- SHA-256 of file content
  exchange TEXT NOT NULL,
  export_type TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, file_hash)
);
```

### `user_preferences`
Key-value store for user settings (synced to backend).
```sql
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);
```

### `import_batches` / `import_rows` / `import_row_fingerprints`
Audit trail for CSV imports. Tracks every import batch, individual row status, and fingerprints for deduplication.

### `exchange_connections`
Created dynamically by `exchange-sync.ts`. Stores encrypted API keys for exchange sync.
```sql
CREATE TABLE exchange_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  passphrase TEXT,
  label TEXT,
  status TEXT DEFAULT 'connected',
  last_sync TEXT,
  sync_count INTEGER DEFAULT 0,
  UNIQUE(user_id, exchange)
);
```

---

## 5. Backend API (Cloudflare Worker)

**Entry point**: `backend/src/index.ts`  
**Framework**: Hono  
**Base URL**: `https://cryptotracker-api.taheito26.workers.dev`

### Route Map

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/status` | No | Health check (returns latest price snapshot age) |
| `GET` | `/api/assets` | No | List all assets from D1 |
| `POST` | `/api/assets` | Yes | Auto-create a new asset |
| `GET` | `/api/prices` | No | Latest KV price snapshot |
| `GET` | `/api/prices/history` | No | 24h rolling price history (720 points) |
| `GET` | `/api/transactions` | Yes | User's transactions |
| `POST` | `/api/transactions` | Yes | Create single transaction |
| `POST` | `/api/transactions/batch` | Yes | Create up to 500 transactions |
| `PUT` | `/api/transactions/:id` | Yes | Update transaction |
| `DELETE` | `/api/transactions/:id` | Yes | Delete transaction |
| `GET` | `/api/tracking-preferences` | Yes | Get tracking mode |
| `PUT` | `/api/tracking-preferences` | Yes | Set tracking mode |
| `GET` | `/api/imported-files` | Yes | List imported files |
| `POST` | `/api/imported-files` | Yes | Record new import |
| `GET` | `/api/preferences` | Yes | Get all user preferences |
| `PUT` | `/api/preferences` | Yes | Upsert preferences (JSON body) |
| `POST` | `/api/import/lookup` | Yes | Check fingerprints for dedup |
| `POST` | `/api/import/record` | Yes | Record import batch audit |
| `GET` | `/api/market-data` | No | Proxied market data (cascading fallback) |
| `GET` | `/api/fear-greed` | No | Fear & Greed Index (cached in KV) |
| `GET` | `/api/exchange-sync` | Yes | List exchange connections |
| `POST` | `/api/exchange-sync` | Yes | Save exchange connection |
| `POST` | `/api/exchange-sync/test/:exchange` | Yes | Test exchange API key |
| `POST` | `/api/exchange-sync/sync/:exchange` | Yes | Sync trades from exchange |
| `DELETE` | `/api/exchange-sync/:exchange` | Yes | Delete exchange connection |

### Cron Job
- **Schedule**: Every 2 minutes (`*/2 * * * *`)
- **Handler**: `backend/src/cron/poll-prices.ts`
- **Behavior**:
  1. Reads all assets with `binance_symbol` from D1
  2. Fetches batch ticker from Binance REST API
  3. Stores latest snapshot in KV (`prices:latest`, TTL 10min)
  4. Appends to rolling history in KV (`prices:history`, 720 points, TTL 25h)

### Market Data Proxy (`/api/market-data`)
Server-side proxy that cascades through 5 data sources:
1. **CoinGecko** (up to 500 coins, 2 pages)
2. **CoinCap** (250 coins)
3. **CoinPaprika** (250 coins)
4. **CryptoCompare** (100 coins)
5. **Binance REST** (500 USDT pairs)

Results cached in KV for 5 minutes. Falls back to stale cache if all sources fail.

### Fear & Greed Proxy (`/api/fear-greed`)
Proxies Alternative.me API, returns 30-day history. Cached in KV for 10 minutes.

### CORS
`backend/src/middleware/cors.ts` — Dynamic CORS that auto-allows:
- `localhost:*`
- `*.lovableproject.com`
- `*.lovable.app`
- Origins listed in `ALLOWED_ORIGINS` env var
- Uses `Vary: Origin` header for correct caching

---

## 6. Frontend Application

### Entry Point
```
index.html → src/main.tsx → src/App.tsx
```

`main.tsx` wraps the app in `<ClerkProvider>` using `VITE_CLERK_PUBLISHABLE_KEY`.

### App Shell (`src/App.tsx`)
```
ClerkRoot (auth gate)
  ├── LoadingScreen (while Clerk loads)
  ├── SignInScreen (when not authenticated)
  └── CryptoProvider
      └── AppShell
          ├── Sidebar (navigation)
          ├── Topbar (page title, command palette, zen mode)
          └── Page content (tab-based, no router)
```

### Navigation
Tab-based SPA — no URL routing. Current page stored in `useState("dashboard")`.

**Pages**: Dashboard, Portfolio, Markets, Ledger, Calendar, Settings

---

## 7. Pages & Features

### 7.1 Dashboard (`src/pages/DashboardPage.tsx`)

**Cards** (drag-reorderable, layout saved to localStorage):

| Card ID | Component | Description |
|---------|-----------|-------------|
| `kpis` | Inline | 3-column responsive grid: Unrealized P&L, Realized P&L, Total Cost |
| `allocation` | `DonutChart` + `DonutLegend` | SVG donut showing top 12 coin allocations |
| `heatmap` | `HeatmapBlock` | 3×3 grid of top positions, color-coded by P&L % |
| `fearGreed` | `FearGreedGauge` | Fear & Greed Index with SVG arc gauge + 30-day sparkline |
| `movers` | Inline | Top 3 gainers and top 3 losers by unrealized P&L % |
| `watchlist` | Inline | User's watchlist coins with price, 24h%, 7d% |
| `benchmark` | `BenchmarkChart` | Portfolio vs BTC/ETH/S&P 500 normalized % chart (1D/7D/30D/3M/1Y) |
| `riskBreakdown` | `PerAssetRiskBreakdown` | Per-asset volatility, VaR 95%, CVaR 95%, concentration (HHI) |
| `positions` | Inline | Top positions table with qty, price, value, P&L |

**Features**:
- Drag-and-drop card reordering with ⠿ handle
- ⚙ Customize mode toggle
- ↺ Reset layout to defaults

### 7.2 Portfolio (`src/pages/PortfolioPage.tsx`)

Full-featured sortable/filterable position table.

**Display Modes**:
- **DCA View**: Shows aggregated positions with avg buy price
- **Lot View**: Shows individual FIFO lots per asset, expandable

**Columns** (17 total, user-configurable visibility + drag reorder):
`#`, `Asset`, `Amount`, `Price Graph` (sparkline), `1h %`, `24h %`, `7d %`, `Price`, `Value`, `Allocation %`, `Avg Buy`, `Avg Sell`, `P/L`, `Profit %`, `Realized P/L`, `Market Cap`, `Volume 24h`

**Features**:
- Multi-select asset filter (`AssetFilter` component)
- Column visibility toggle panel
- Column drag-to-reorder
- Sort by any column (asc/desc)
- Live sparklines from CoinGecko 7-day data
- Responsive: table on desktop, cards on mobile
- Click asset → `AssetDrilldown` modal

**KPIs**: Portfolio Value, Total P&L (with %), Total Cost

### 7.3 Asset Drilldown (`src/components/AssetDrilldown.tsx`)

Modal overlay showing detailed single-asset view:
- **KPI Row**: Holdings qty, Avg Cost, Current Price, Market Value
- **Price Chart**: SVG area chart with 7D/30D/90D/1Y range selector (CoinGecko history)
- **P&L Summary**: Cost Basis, Unrealized P&L (with %), Realized P&L
- **Open Lots Table**: Date, Qty, Remaining, Unit Cost, Cost Basis
- **Transaction History**: Last 50 transactions for this asset

### 7.4 Markets (`src/pages/MarketsPage.tsx`)

Live market data with multiple visualization modes.

**View Modes**:
| Mode | Component | Description |
|------|-----------|-------------|
| Table | `MarketTable` | Sortable table: rank, coin, price, 1h/24h/7d %, market cap, volume, watchlist ★ |
| Watchlist | `MarketTable` (filtered) | Same table but only watchlisted coins |
| Bubbles | `BubbleCanvas` | Interactive bubble chart sized by market cap, colored by change % |
| Heatmap | `HeatmapGrid` | Grid of colored blocks showing price changes |

**Controls**:
- Time range: 1H / 24H / 7D
- Coin count: Top 100 / 250 / 500
- Watchlist toggle (adds/removes symbols to `state.watch`)

**Stats Bar** (`MarketStats`): Total market cap, 24h volume, BTC dominance

### 7.5 Ledger (`src/pages/LedgerPage.tsx`)

Transaction management hub with 4 tabs.

**Tab: Journal**
- Searchable, filterable transaction list (latest 500)
- Type filter: All / Buy / Sell / Transfer In / Transfer Out / Reward / Adjustment
- Inline editing: click ✏ to edit type, qty, price
- Delete with confirmation
- Type badges with color coding
- Stats bar: Total txns, unique assets, buys, sells, buy/sell values

**Tab: Add**
- Manual transaction entry form
- Fields: Type (6 options), Asset (autocomplete via `CoinAutocomplete`), Quantity, Price, Fee, Exchange/Venue, Notes
- Asset autocomplete searches CoinGecko API
- Backend-first: calls `createManualTransaction()` which resolves/creates asset, then creates transaction

**Tab: Import**
- CSV file upload with drag-and-drop
- Auto-detects exchange from CSV headers (Binance, Bybit, OKX, Gate.io, MEXC, KuCoin)
- Preview stage: shows parsed rows with status (new/alreadyImported/invalid/warning)
- Delta detection: fingerprint-based dedup against backend
- Commit stage: resolves assets (auto-creates missing), batches transactions, records import audit
- Post-import: shows summary (persisted/skipped/failed counts)
- Import history: lists previously imported files

**Tab: Connect**
- Exchange API connection management (`ExchangeConnect` component)
- See [Exchange API Sync](#11-exchange-api-sync)

**Write Status Banner**: Shows backend connectivity status (checking/ready/unavailable/unconfigured)

### 7.6 Calendar (`src/pages/CalendarPage.tsx`)

Monthly P&L calendar with per-coin filtering.

**Features**:
- Calendar grid showing daily P&L (color-coded green/red)
- Monthly KPIs: Monthly P&L, Active Days, Total Entries
- Coin filter: select specific assets to view
- Click day → drilldown showing:
  - Daily P&L and entry count
  - Table of individual trades with asset, type, qty, P&L
  - Portfolio value as of that day

**P&L Calculation**:
- Sells: realized P&L via FIFO lot matching (`deriveRealizedByTx`)
- Buys: unrealized P&L using current price vs buy price
- Fees: negative P&L

### 7.7 Settings (`src/pages/SettingsPage.tsx`)

**Sections**:

1. **Layout Templates** (8 layouts):
   | Layout | Style | Font |
   |--------|-------|------|
   | Flux | Modern SaaS | Inter |
   | Cipher | Dark Terminal | JetBrains Mono |
   | Vector | Corporate | Plus Jakarta Sans |
   | Aurora | Gradient SaaS | Plus Jakarta Sans |
   | Carbon | Dark Monitor | JetBrains Mono |
   | Prism | Bold Fintech | Space Grotesk |
   | Noir | Luxury Dark | Inter |
   | Pulse | Neon Crypto | DM Sans |

2. **Theme Colors**: 5 color themes per layout (t1–t5), each defining brand, bg, panel, text, good, bad, muted, line colors

3. **Tracking Method**: FIFO / DCA toggle

4. **Base Currency**: USD / EUR / GBP / QAR

5. **Timezone**: 11 options (Local, UTC, US Eastern/Central/Pacific, London, Berlin, Tokyo, Shanghai, Dubai, Qatar)

6. **Number Format**: US/UK (1,234.56) / EU (1.234,56) / Compact (1.23K)

7. **Refresh Interval**: 1/2/5/10 minutes

8. **Notifications**: Browser notification toggle

9. **Price Alerts**: In-page alert table editor
   - Add/edit/delete alerts
   - Fields: Symbol, Type (price_above/price_below), Threshold, Active toggle
   - Alert count shown as badge in sidebar

10. **Data Management**:
    - Clear all transactions
    - Clear imported files list
    - Export state as JSON

11. **Vault** (IndexedDB snapshots):
    - Save/restore application state snapshots
    - Label, timestamp, export/delete

---

## 8. State Management

### CryptoContext (`src/lib/cryptoContext.tsx`)

Central React context providing:
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

### CryptoState (`src/lib/cryptoState.ts`)

```typescript
interface CryptoState {
  // Business data (hydrated from backend)
  txs: CryptoTx[];
  importedFiles: ImportedFile[];
  
  // UI preferences (persisted to localStorage + backend)
  base: string;       // "USD" | "EUR" | "GBP" | "QAR"
  method: string;     // "FIFO" | "DCA"
  watch: string[];    // Watchlist symbols
  layout: string;     // Layout template ID
  theme: string;      // Theme ID (t1-t5)
  alerts: CryptoAlert[];
  
  // Extended preferences
  timezone: string;
  numberFormat: string;
  refreshInterval: number;
  notifications: boolean;
  
  // Runtime
  prices: Record<string, number>;
  syncStatus: string;
}

interface CryptoTx {
  id: string;
  asset: string;    // Symbol (e.g., "BTC")
  type: string;     // "buy" | "sell" | "transfer_in" | "transfer_out" | "reward" | "fee" | "adjustment"
  qty: number;
  price: number;
  fee: number;
  ts: number;        // Unix ms
  venue: string;
  note: string;
  source: string;
}
```

### Hydration Flow
1. On auth (userId changes): clear stale txs, call `rehydrateFromBackend()`
2. `rehydrateFromBackend()`:
   - Fetches asset catalog (`/api/assets`)
   - Fetches user transactions (`/api/transactions`)
   - Fetches imported files (`/api/imported-files`)
   - Fetches user preferences (`/api/preferences`)
   - Runs one-time localStorage→D1 migration if needed (`src/lib/migration.ts`)
3. Preferences auto-saved to backend on change

### Mutation Hook (`src/hooks/useLedgerMutations.ts`)

```typescript
interface UseLedgerMutations {
  writeStatus: "checking" | "ready" | "unavailable" | "unconfigured";
  checkWriteStatus: () => Promise<void>;
  createManualTransaction(params): Promise<MutationResult>;
  updateLedgerTransaction(txId, updates): Promise<MutationResult>;
  deleteLedgerTransaction(txId): Promise<MutationResult>;
  commitImportedTransactions(params): Promise<ImportMutationResult>;
}
```

All mutations:
1. Check `ensureWriteReady()` (worker configured + authenticated + available)
2. Call API
3. Call `rehydrateFromBackend()` to refresh state
4. Return success/error result

---

## 9. Price System

### Architecture: 3-Layer Priority

```
Priority 1: Binance WebSocket (real-time ticks, ~100ms latency)
    ↓ fallback
Priority 2: Binance REST (bootstrap on mount, batch ticker)
    ↓ fallback
Priority 3: CoinGecko / Market Data (via Worker proxy or direct)
```

### Components

#### `src/lib/priceProvider.ts`
- **Symbol Maps**: `BINANCE_SYMBOLS` (160+ symbols → USDT pairs), `KNOWN_IDS` (symbols → CoinGecko IDs)
- **Stablecoins**: USDT, USDC, BUSD, DAI, TUSD, FDUSD, UST, PYUSD hardcoded to $1.00
- **`getSpotPrices(assets)`**: Batch REST call to Binance `/api/v3/ticker/24hr`, CoinGecko fallback for missing
- **WebSocket Singleton**: Connects to `wss://stream.binance.com:9443/stream?streams=...@ticker`
  - Auto-reconnect on close (5s delay)
  - Publishes price updates to all subscribers
  - Cleans up when no subscribers remain
- **`getDailyHistory(coingeckoId, days)`**: Historical price data for charts (1h cache)
- **`searchCoins(query)`**: CoinGecko search for autocomplete (30min cache)

#### `src/hooks/useLivePrices.ts`
Shared hook combining all price sources:
- Market data polling (3min interval, localStorage cache for resilience)
- Binance REST bootstrap on mount
- Binance WebSocket subscription for portfolio assets + watchlist
- `getPrice(sym)`: Merged getter returning `LiveCoin` with best available data

#### `src/hooks/usePortfolioPriceGetter.ts`
Portfolio-specific price getter with 3-layer cascade:
1. Binance WS/REST spot price
2. CoinGecko live data
3. Cached state prices

#### `src/hooks/useSparklineData.ts`
Fetches 7-day sparkline data from CoinGecko for portfolio table:
- Rate-limited: 1.5s delay between requests
- Max 20 concurrent fetches
- Shared cache to avoid redundant calls

### Backend Price Cron (`backend/src/cron/poll-prices.ts`)
Every 2 minutes:
1. Query D1 for assets with `binance_symbol`
2. Batch fetch from Binance REST
3. Store in KV:
   - `prices:latest`: Full snapshot (TTL 10min)
   - `prices:history`: Rolling 24h array of mini-snapshots (720 points, TTL 25h)

---

## 10. CSV Import Pipeline

### Flow
```
File Upload → Parse CSV → Detect Exchange → Exchange Adapter → Canonicalize
  → Fingerprint → Dedup Check (backend lookup) → Preview → User Confirms
  → Resolve Assets → Batch Create Transactions → Record Import Audit
```

### Components

#### `src/lib/importers/csv.ts`
- `parseCSV(text)`: PapaParse wrapper with BOM handling, header trimming, string-only output
- `hashString(content)`: SHA-256 hex digest via Web Crypto

#### `src/lib/importers/detector.ts`
Auto-detects exchange from CSV headers:

| Exchange | Export Types | Required Headers |
|----------|-------------|-----------------|
| Binance | spot_trade_history | Date(UTC), Market, Type, Price, Amount, Total, Fee, Fee Coin |
| Bybit | trade_history | Symbol, Side, Qty, Price, Exec Time, Exec Fee |
| OKX | trade_history | Instrument, Type, Order Price, Filled Price, Amount, Fee |
| Gate.io | trade_history | Currency Pair, Type, Price, Amount, Total, Fee |
| MEXC | trade_history | Pairs, Side, Filled Price, Amount, Total, Fee |
| KuCoin | trade_history | tradeCreatedAt, symbol, side, price, size, fee |

Confidence scoring (0–1), threshold ≥0.9 for auto-detection. Rejects futures/margin/earn exports.

#### Exchange Adapters
Each adapter (`src/lib/importers/{binance,bybit,okx,gate,mexc,kucoin}.ts`):
- Parses exchange-specific CSV format
- Returns `NormalizedRow[]` with standardized fields
- Reports `SkippedRow[]` for unparseable entries

#### `src/lib/importers/index.ts` — Orchestrator
`importCSV(fileContent, fileName, opts?)`:
1. Detect exchange via header analysis
2. Select adapter and parse rows
3. Canonicalize: `NormalizedRow` → `CanonicalTransactionRow`
4. Validate (timestamp, qty > 0, price > 0)
5. Compute fingerprint per row (SHA-256 of `tradeId|orderId|txHash` or composite)
6. Detect intra-file duplicates
7. Return `ParseResult` with warnings and date range

`applyLookup(rows, lookup)`:
- Marks rows as `alreadyImported` if fingerprint exists in backend
- Marks as `conflict` if native ID exists with different fingerprint

### Types (`src/lib/importers/types.ts`)
```typescript
type Exchange = "binance" | "bybit" | "okx" | "gate" | "mexc" | "kucoin";
type ImportRowStatus = "new" | "alreadyImported" | "warning" | "invalid" | "conflict";

interface ImportPreviewRow extends CanonicalTransactionRow {
  fingerprint: string;
  fingerprintHash: string;
  nativeId: string | null;
  status: ImportRowStatus;
  message: string | null;
}
```

---

## 11. Exchange API Sync

### Supported Exchanges
| Exchange | Auth Method | Features |
|----------|-----------|----------|
| Binance | API Key + Secret | Spot trades (30 pairs max) |
| Bybit | API Key + Secret + HMAC | Spot execution history (paginated) |
| OKX | API Key + Secret + Passphrase | Spot fills history (paginated) |
| Gate.io | API Key + Secret + HMAC-SHA512 | Spot trades |
| Coinbase | API Key + Secret | Buys & Sells per account |
| Kraken | API Key + Base64 Secret | Trades history (HMAC-SHA512) |

### Backend (`backend/src/routes/exchange-sync.ts`)
- **Save**: Stores API key/secret in `exchange_connections` table
- **Test**: Validates credentials by making a lightweight API call
- **Sync**: Fetches trades via exchange API, resolves assets, creates transactions with `source: 'exchange_sync'`, dedup via `external_id`
- **Delete**: Removes connection (doesn't delete imported trades)

### Frontend (`src/components/ledger/ExchangeConnect.tsx`)
- Exchange grid with connect/disconnect per exchange
- API key input form with per-exchange setup instructions
- Test connection button
- Sync individual exchange or "Sync All"
- Sync All progress bar
- **Auto-sync**: Toggle with configurable interval (15/30/60/120 min)
- Results summary showing synced/skipped/error per exchange

---

## 12. Portfolio Derivation Engine

### Core: `src/lib/derivePortfolio.ts`

Pure FIFO lot-matching engine. **No side effects, no persistence**.

#### `runFifo(txs: CryptoTx[]): FifoState`
1. Sort transactions by timestamp
2. For each transaction:
   - **IN types** (buy, reward, transfer_in, deposit, positive adjustment): Create new lot with unit cost
   - **OUT types** (sell, transfer_out, withdrawal, fee, negative adjustment): Consume lots FIFO
   - **Sell**: Calculate realized P&L = proceeds - cost consumed
3. Returns: `lotsMap`, `realizedByAsset`, `realizedByTxId`, `txCountByAsset`

#### `derivePortfolio(txs, getPrice): PortfolioSummary`
1. Run FIFO
2. For each asset with open lots (qty > 1e-10):
   - Sum remaining qty and cost
   - Look up current price via `getPrice(sym)`
   - Calculate MV, unrealized P&L, avg cost
3. Sort positions by market value (desc)
4. Return: `{ positions, totalMV, totalCost, totalPnl, totalPnlPct, realizedPnl }`

#### Types
```typescript
interface DerivedLot {
  id: string;
  ts: number;
  asset: string;
  qty: number;      // Original quantity
  qtyRem: number;   // Remaining after sells
  unitCost: number;
  tag: string;       // Transaction type that created this lot
}

interface DerivedPosition {
  sym: string;
  qty: number;
  cost: number;       // Total cost basis of remaining lots
  price: number | null;
  mv: number | null;
  unreal: number | null;
  avg: number;         // Weighted average cost
  lots: DerivedLot[];
  realizedPnl: number;
  txCount: number;
}
```

### Hook: `src/hooks/useUnifiedPortfolio.ts`
Single hook used by Dashboard, Portfolio, Calendar, and Drilldown:
```typescript
function useUnifiedPortfolio(): PortfolioSummary & {
  base: string;
  method: string;
  getPosition: (sym: string) => DerivedPosition | undefined;
}
```
Memoized: recomputes only when `state.txs` or `priceGetter` changes.

---

## 13. Theming & Layout System

### How It Works
1. User selects layout (8 options) and theme (5 per layout) in Settings
2. `CryptoContext` applies CSS variables to `document.documentElement` via `dataset.layout` and `dataset.theme`
3. `src/index.css` defines all 40 combinations (8 layouts × 5 themes) using `[data-layout][data-theme]` selectors
4. Each combination sets ~15 CSS custom properties: `--brand`, `--bg`, `--panel`, `--text`, `--good`, `--bad`, `--muted`, `--line`, etc.
5. Font loaded via `--app-font` applied to body

### CSS Custom Properties
```css
:root {
  --brand: <color>;     /* Primary accent */
  --brand2: <color>;    /* Secondary accent */
  --brand3: <color>;    /* Subtle accent background */
  --bg: <color>;        /* Page background */
  --panel: <color>;     /* Panel/card background */
  --panel2: <color>;    /* Nested panel background */
  --card: <color>;      /* Card background */
  --text: <color>;      /* Primary text */
  --muted: <color>;     /* Secondary text */
  --muted2: <color>;    /* Tertiary text */
  --good: <color>;      /* Positive/green */
  --bad: <color>;       /* Negative/red */
  --warn: <color>;      /* Warning/yellow */
  --line: <color>;      /* Borders */
  --input: <color>;     /* Input background */
  --lt-radius: <size>;  /* Border radius */
  --lt-radius-sm: <size>;
}
```

### Layout Preview Cards
Each layout has a miniature preview in Settings showing the color scheme with a sidebar + cards mockup.

---

## 14. Configuration & Environment

### Frontend Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key for auth |
| `VITE_WORKER_API_URL` | Yes | Cloudflare Worker API base URL |

### Backend Environment (Wrangler)
| Binding/Secret | Type | Description |
|----------------|------|-------------|
| `DB` | D1 Database | `crypto-tracker` (ID: `e51dd932-...`) |
| `PRICE_KV` | KV Namespace | Price cache (ID: `5a8b838f...`) |
| `CLERK_JWKS_URL` | Secret | `https://<clerk-domain>/.well-known/jwks.json` |
| `ALLOWED_ORIGINS` | Variable | Comma-separated allowed CORS origins |

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

[[kv_namespaces]]
binding = "PRICE_KV"
```

---

## 15. Deployment

### Frontend
- **Host**: Lovable (or Cloudflare Pages)
- **Build**: `npm run build` (Vite production build)
- **Published URL**: `https://coin-compass-calendar.lovable.app`

### Backend
- **Host**: Cloudflare Workers
- **Deploy**: `cd backend && npx wrangler deploy`
- **DB Init**: 
  ```bash
  npx wrangler d1 execute crypto-tracker --file=../seed/schema.sql --remote
  npx wrangler d1 execute crypto-tracker --file=../seed/assets.sql --remote
  ```

### GitHub Actions
- `.github/workflows/deploy-backend.yml` — Worker deployment
- `.github/workflows/deploy-frontend.yml` — Frontend deployment

---

## 16. File Structure Reference

```
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Worker entry point, route registration, cron handler
│   │   ├── types.ts                 # D1 row types, KV types, Env interface
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Clerk JWT verification (RS256 + JWKS)
│   │   │   └── cors.ts             # Dynamic CORS middleware
│   │   ├── routes/
│   │   │   ├── assets.ts            # GET/POST /api/assets
│   │   │   ├── prices.ts            # GET /api/prices, /api/prices/history
│   │   │   ├── transactions.ts      # CRUD /api/transactions
│   │   │   ├── tracking.ts          # GET/PUT /api/tracking-preferences
│   │   │   ├── imported-files.ts    # GET/POST /api/imported-files
│   │   │   ├── preferences.ts       # GET/PUT /api/preferences
│   │   │   ├── import.ts            # POST /api/import/lookup, /api/import/record
│   │   │   ├── market-data.ts       # GET /api/market-data (5-source proxy)
│   │   │   ├── fear-greed.ts        # GET /api/fear-greed
│   │   │   └── exchange-sync.ts     # Exchange API CRUD + sync (6 exchanges)
│   │   └── cron/
│   │       └── poll-prices.ts       # Binance price polling (every 2min)
│   ├── wrangler.toml                # Cloudflare config (D1, KV, cron)
│   └── package.json
│
├── src/
│   ├── main.tsx                     # App entry + ClerkProvider
│   ├── App.tsx                      # Auth gate + AppShell + page routing
│   ├── index.css                    # Global styles, theme definitions, layout CSS
│   ├── responsive-overrides.css     # Mobile responsive overrides
│   │
│   ├── lib/
│   │   ├── api.ts                   # Centralized Worker API client (apiFetch + typed helpers)
│   │   ├── cryptoContext.tsx         # CryptoProvider: state, hydration, toast, effects
│   │   ├── cryptoState.ts           # State types, defaults, localStorage persistence, formatters
│   │   ├── derivePortfolio.ts       # Pure FIFO derivation engine
│   │   ├── priceProvider.ts         # Binance WS/REST + CoinGecko price layer
│   │   ├── assetResolver.ts         # Asset catalog cache + resolve/create helpers
│   │   ├── symbolAliases.ts         # Symbol normalization (XBT→BTC, pair splitting)
│   │   ├── portfolioCalculations.ts # Alternative FIFO/DCA calculators (legacy)
│   │   ├── migration.ts             # One-time localStorage→D1 migration
│   │   └── importers/
│   │       ├── index.ts             # Import orchestrator (detect → parse → canonicalize → dedup)
│   │       ├── types.ts             # Import pipeline types
│   │       ├── csv.ts               # CSV parser + SHA-256 hasher
│   │       ├── detector.ts          # Exchange auto-detection from headers
│   │       ├── binance.ts           # Binance CSV adapter
│   │       ├── bybit.ts             # Bybit CSV adapter
│   │       ├── okx.ts               # OKX CSV adapter
│   │       ├── gate.ts              # Gate.io CSV adapter
│   │       ├── mexc.ts              # MEXC CSV adapter
│   │       └── kucoin.ts            # KuCoin CSV adapter
│   │
│   ├── hooks/
│   │   ├── useLivePrices.ts         # Combined price hook (market + WS + REST)
│   │   ├── useUnifiedPortfolio.ts   # Portfolio derivation hook (single source of truth)
│   │   ├── usePortfolioPriceGetter.ts # 3-layer price getter for portfolio
│   │   ├── useSparklineData.ts      # CoinGecko sparkline fetcher
│   │   ├── useLedgerMutations.ts    # Backend-first CRUD mutations
│   │   ├── usePortfolio.ts          # Legacy portfolio hook
│   │   └── use-mobile.tsx           # Mobile viewport detection
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx        # Dashboard with 9 draggable cards
│   │   ├── PortfolioPage.tsx        # Sortable position table with lots
│   │   ├── MarketsPage.tsx          # Live markets (table/watchlist/bubbles/heatmap)
│   │   ├── LedgerPage.tsx           # Transaction CRUD + CSV import + exchange connect
│   │   ├── CalendarPage.tsx         # Monthly P&L calendar
│   │   ├── SettingsPage.tsx         # Layout/theme/prefs/alerts/vault
│   │   └── NotFound.tsx             # 404 page
│   │
│   ├── components/
│   │   ├── Sidebar.tsx              # Navigation sidebar (6 pages)
│   │   ├── Topbar.tsx               # Page header + command palette + zen mode
│   │   ├── CommandPalette.tsx        # ⌘K command palette (page nav + quick actions)
│   │   ├── GlobalSearch.tsx          # Global search component
│   │   ├── CoinAutocomplete.tsx      # Asset search with CoinGecko API
│   │   ├── AssetDrilldown.tsx        # Single-asset detail modal
│   │   ├── dashboard/
│   │   │   ├── FearGreedGauge.tsx    # Fear & Greed Index gauge
│   │   │   ├── BenchmarkChart.tsx    # Portfolio vs benchmarks chart
│   │   │   ├── PerAssetRiskBreakdown.tsx # VaR/CVaR risk table
│   │   │   ├── ZenModeToggle.tsx     # Zen mode toggle button
│   │   │   ├── HistoricalNetValue.tsx # Historical net value chart (removed from dashboard)
│   │   │   ├── EventsAnalysis.tsx    # Events analysis component
│   │   │   └── ValueDistribution.tsx # Value distribution chart
│   │   ├── markets/
│   │   │   ├── MarketTable.tsx       # Sortable market data table
│   │   │   ├── MarketStats.tsx       # Market summary stats bar
│   │   │   ├── BubbleCanvas.tsx      # Interactive bubble chart
│   │   │   └── HeatmapGrid.tsx       # Market heatmap grid
│   │   ├── portfolio/
│   │   │   ├── Sparkline.tsx         # SVG sparkline component
│   │   │   └── AssetFilter.tsx       # Multi-select asset filter
│   │   ├── ledger/
│   │   │   └── ExchangeConnect.tsx   # Exchange API connection management
│   │   └── ui/                       # shadcn/ui components (40+ Radix-based)
│   │
│   └── test/
│       ├── setup.ts                  # Vitest setup
│       ├── example.test.ts
│       └── ledger-canonical.test.ts  # Import pipeline tests
│
├── seed/
│   ├── schema.sql                    # D1 schema (all tables + indexes)
│   ├── assets.sql                    # Asset catalog seed data
│   └── add_unique_external_id.sql    # Migration for external_id uniqueness
│
├── ARCHITECTURE.md                   # Architecture spec
├── DOCUMENTATION.md                  # This file
└── package.json
```

---

## 17. Key Interfaces & Types

### API Types (`src/lib/api.ts`)
```typescript
interface ApiAsset {
  id: string; symbol: string; name: string;
  coingecko_id: string | null; binance_symbol: string | null;
  category: string; precision_qty: number; precision_price: number;
}

interface ApiTransaction {
  id: string; user_id: string; asset_id: string;
  timestamp: string; type: string; qty: number;
  unit_price: number; fee_amount: number; fee_currency: string;
  venue: string | null; note: string | null; source: string;
  external_id: string | null;
}

interface ApiPriceEntry {
  price: number; change_1h: number | null;
  change_24h: number | null; change_7d: number | null;
  market_cap: number | null; volume_24h: number | null;
}
```

### Live Price Types
```typescript
interface SpotPrice {
  price: number; change24h: number; ts: number;
  stale: boolean; source: "binance" | "coingecko";
}

interface LiveCoin {
  id: string; symbol: string; name: string;
  current_price: number; market_cap: number; total_volume: number;
  market_cap_rank: number; image: string;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}
```

### Worker Environment
```typescript
interface Env {
  DB: D1Database;
  PRICE_KV: KVNamespace;
  CLERK_JWKS_URL?: string;
  ALLOWED_ORIGINS?: string;
}
```

---

## Appendix: Symbol Resolution

### Flow
```
Raw symbol (e.g., "BTCUSDT", "BTC/USDT", "XBT")
  → extractBaseFromPair() → strip quote currencies, slashes, dashes
  → normalizeSymbol() → uppercase, strip leading digits, apply aliases
  → matchAssetBySymbol() → match against D1 assets by symbol or binance_symbol
  → resolveOrCreateAsset() → auto-create in D1 if not found
```

### Aliases (`src/lib/symbolAliases.ts`)
```
XBT → BTC, BCHABC → BCH, BCHSV → BSV, MIOTA → IOTA,
LUNA2 → LUNA, CGLD → CELO, RNDR → RENDER, etc.
```

### Quote Currencies Stripped
```
USDT, USDC, BUSD, TUSD, FDUSD, DAI, UST,
BTC, ETH, BNB, EUR, GBP, TRY, BRL, ARS, USD, PERP
```
