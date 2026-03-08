# CoinCompass / CryptoTracker — Complete Architecture & Feature Documentation

> Use this document to recreate the entire application with another AI or development team.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Authentication](#3-authentication)
4. [Database Schema](#4-database-schema)
5. [Backend API (Cloudflare Worker)](#5-backend-api-cloudflare-worker)
6. [Frontend Architecture](#6-frontend-architecture)
7. [State Management](#7-state-management)
8. [Pages & Features](#8-pages--features)
9. [Price System](#9-price-system)
10. [CSV Import System](#10-csv-import-system)
11. [Portfolio Calculation Engine](#11-portfolio-calculation-engine)
12. [Design System](#12-design-system)
13. [Data Flow Diagrams](#13-data-flow-diagrams)
14. [Deployment](#14-deployment)
15. [Environment Variables](#15-environment-variables)

---

## 1. High-Level Architecture

```
┌──────────────────────────┐
│   Vite + React Frontend  │
│   (Lovable / Vercel)     │
│   Clerk Auth (client)    │
│   Binance WS + CoinGecko │
└──────────┬───────────────┘
           │ HTTPS + Bearer JWT
           ▼
┌──────────────────────────┐
│ Cloudflare Worker (Hono) │
│  RS256 JWT verification  │
│  via Clerk JWKS endpoint │
└───────┬────────┬─────────┘
        │        │
        ▼        ▼
┌──────────┐ ┌──────────┐
│ D1 (SQL) │ │ KV Cache │
│ Assets   │ │ Prices   │
│ Txns     │ │ History  │
│ Prefs    │ └──────────┘
│ Files    │
└──────────┘
```

**Key Principles:**
- **Single source of truth**: Cloudflare D1 is the canonical store for all portfolio data
- **Transaction ledger is king**: All positions, lots, P&L are *derived* from transactions — never stored
- **localStorage is UI-only**: Stores layout, theme, watchlist, method (FIFO/DCA), base currency
- **No Supabase in runtime**: The project has Supabase types/client for legacy reasons but ALL data flows through the Cloudflare Worker

---

## 2. Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| Tailwind CSS | Utility classes (minimal usage — custom CSS dominates) |
| `@clerk/react` | Authentication (client-side) |
| `recharts` / `chart.js` | Charts (available but most charts are custom SVG/Canvas) |
| `react-router-dom` | Available but NOT used — SPA uses state-based navigation |

### Backend
| Technology | Purpose |
|---|---|
| Cloudflare Worker | Serverless API runtime |
| Hono | HTTP framework |
| Cloudflare D1 | SQLite relational database |
| Cloudflare KV | Price snapshot cache |
| Cron Triggers | Price polling every 2 minutes |

### External APIs (no keys needed)
| API | Purpose |
|---|---|
| Binance REST (`/api/v3/ticker/24hr`) | Bootstrap prices + backend cron |
| Binance WebSocket (`wss://stream.binance.com`) | Real-time price ticks |
| CoinGecko (`/api/v3/coins/markets`) | Market data for bubbles/table, sparklines, search |

---

## 3. Authentication

**Provider:** Clerk (RS256 JWTs)

### Frontend (`src/main.tsx`)
```tsx
<ClerkProvider publishableKey={clerkKey}>
  <App />
</ClerkProvider>
```
- Falls back to a test key if `VITE_CLERK_PUBLISHABLE_KEY` is missing
- Uses `useAuth()` for `getToken()`, `isSignedIn`, `signOut()`
- Uses `useUser()` for display name/email
- `<SignIn routing="hash" />` for the login form
- `<UserButton />` for the account widget

### Backend (`backend/src/middleware/auth.ts`)
- Verifies RS256 JWTs by fetching the JWKS from `CLERK_JWKS_URL`
- Extracts `sub` claim as `userId`
- Validates `exp` and `nbf`
- Caches imported RSA keys for 60 minutes
- All routes except `/api/assets`, `/api/prices`, and `/api/status` require auth

### Auth Flow
1. Frontend gets JWT via `getToken()` from Clerk
2. Sends as `Authorization: Bearer <token>` header
3. Worker fetches JWKS, imports RSA key, verifies signature
4. Sets `userId` on Hono context for route handlers

---

## 4. Database Schema

**Engine:** Cloudflare D1 (SQLite)

### `assets` — Crypto asset catalog (public, pre-seeded)
```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  symbol TEXT NOT NULL,           -- "BTC", "ETH"
  name TEXT NOT NULL,             -- "Bitcoin", "Ethereum"
  coingecko_id TEXT,              -- "bitcoin", "ethereum"
  binance_symbol TEXT,            -- "BTCUSDT", "ETHUSDT"
  category TEXT DEFAULT 'other',  -- layer1, layer2, defi, stablecoin, meme
  precision_qty INTEGER DEFAULT 8,
  precision_price INTEGER DEFAULT 8,
  created_at TEXT DEFAULT (datetime('now'))
);
```
Pre-seeded with ~45 major assets including BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOT, ATOM, LTC, LINK, UNI, DOGE, SHIB, PEPE, etc.

### `transactions` — User transaction ledger (per-user, auth required)
```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('buy','sell','transfer_in','transfer_out','reward','fee','adjustment')),
  qty REAL NOT NULL,
  unit_price REAL DEFAULT 0,
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  venue TEXT,                    -- "Binance", "Coinbase"
  note TEXT,
  tags TEXT,                     -- JSON string array
  source TEXT DEFAULT 'manual',  -- 'manual', 'csv-import', 'migration'
  external_id TEXT,              -- Deterministic ID for idempotent imports
  created_at TEXT,
  updated_at TEXT
);
```

### `tracking_preferences` — Per-user, per-asset tracking mode
```sql
CREATE TABLE tracking_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL DEFAULT '__global__',
  tracking_mode TEXT NOT NULL DEFAULT 'fifo',
  UNIQUE(user_id, asset_id)
);
```

### `imported_files` — CSV import deduplication
```sql
CREATE TABLE imported_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,       -- SHA-256 of file content
  exchange TEXT NOT NULL,
  export_type TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, file_hash)
);
```

### `user_preferences` — Key-value store for UI settings
```sql
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,              -- 'base', 'method', 'layout', 'theme'
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);
```

---

## 5. Backend API (Cloudflare Worker)

**Framework:** Hono  
**File:** `backend/src/index.ts`

### Route Map

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/status` | No | Health check — returns price cache age |
| GET | `/api/assets` | No | Full asset catalog |
| GET | `/api/prices` | No | Latest KV price snapshot |
| GET | `/api/prices/history` | No | 24h rolling price history (720 points) |
| GET | `/api/transactions` | Yes | User's transactions (JOINed with asset symbol/name) |
| POST | `/api/transactions` | Yes | Create single transaction |
| PUT | `/api/transactions/:id` | Yes | Update transaction (ownership verified) |
| DELETE | `/api/transactions/:id` | Yes | Delete transaction (ownership verified) |
| POST | `/api/transactions/batch` | Yes | Batch create (max 500, idempotent via external_id) |
| GET | `/api/tracking-preferences` | Yes | Get tracking mode |
| PUT | `/api/tracking-preferences` | Yes | Set tracking mode (fifo/dca) |
| GET | `/api/imported-files` | Yes | List imported files |
| POST | `/api/imported-files` | Yes | Record imported file (409 on duplicate hash) |
| GET | `/api/preferences` | Yes | Get user preferences |
| PUT | `/api/preferences` | Yes | Upsert preferences (key-value pairs) |

### CORS Policy (`backend/src/middleware/cors.ts`)
- Checks `ALLOWED_ORIGINS` env var (comma-separated)
- Auto-allows `*.lovableproject.com`, `*.lovable.app`, `localhost`
- Sets `Vary: Origin` header

### Cron: Price Polling (`backend/src/cron/poll-prices.ts`)
- Runs every 2 minutes via Cloudflare Cron Triggers
- Fetches all assets with `binance_symbol` from D1
- Calls Binance `/api/v3/ticker/24hr` with all symbols in one request
- Stores latest snapshot in KV (`prices:latest`, TTL 10min)
- Appends to rolling history in KV (`prices:history`, max 720 points, TTL 25h)

### Batch Import Idempotency
The batch endpoint checks `external_id` uniqueness per user:
1. Pre-fetches all existing `external_id` values for the user
2. Skips rows where `external_id` already exists
3. Returns counts: `{ created, skippedDuplicates, errors, errorDetails }`

---

## 6. Frontend Architecture

### Entry Point (`src/main.tsx`)
```
ClerkProvider → App → CryptoProvider → ClerkRoot → AppShell
```

### App Shell (`src/App.tsx`)
- State-based SPA routing (no react-router)
- `page` state controls which page renders
- Layout: `Sidebar` (left) + `Topbar` + scrollable content area
- `CryptoProvider` wraps everything for state management
- Clerk `UserButton` in top-right corner
- Toast notification system

### Component Tree
```
App
├── CryptoProvider (state, backend sync)
│   ├── Sidebar (navigation, 8 pages)
│   ├── Topbar (title, GlobalSearch)
│   └── Pages:
│       ├── DashboardPage (KPIs, donut, heatmap, watchlist, movers)
│       ├── PortfolioPage (sortable table, lots, sparklines, drilldown)
│       ├── CalendarPage (monthly P&L grid, day drilldown)
│       ├── LedgerPage (manual entry, CSV import, transaction table)
│       ├── MarketsPage (bubble chart, table, watchlist toggle)
│       ├── AlertsPage (price alerts CRUD)
│       ├── VaultPage (IndexedDB snapshots, JSON export/import)
│       └── SettingsPage (layouts, themes, preferences)
```

---

## 7. State Management

### CryptoState (`src/lib/cryptoState.ts`)
Central state interface:
```typescript
interface CryptoState {
  base: string;           // "USD", "EUR", "GBP", "QAR"
  method: string;         // "FIFO" or "DCA"
  txs: CryptoTx[];        // Transaction ledger (from backend)
  lots: CryptoLot[];      // Legacy (unused)
  prices: Record<string, number>; // Legacy price cache
  pricesTs: number;
  watch: string[];         // Watchlist symbols ["BTC","ETH",...]
  alerts: CryptoAlert[];   // Price alerts
  connections: CryptoConnection[];
  accounts: { id: string; name: string }[];
  holdings: UserHolding[]; // Legacy
  calendarEntries: CalendarEntry[]; // Legacy
  importedFiles: ImportedFile[];
  layout: string;          // "flux","cipher","vector","aurora","carbon","prism","noir","pulse"
  theme: string;           // "t1","t2","t3","t4","t5"
  syncStatus?: "idle" | "loading" | "synced" | "error";
  syncError?: string;
}
```

### CryptoTx (transaction record)
```typescript
interface CryptoTx {
  id: string;      // UUID from backend or "local_xxx"
  ts: number;      // Unix ms timestamp
  type: string;    // buy, sell, transfer_in, transfer_out, reward, fee, adjustment
  asset: string;   // Normalized symbol "BTC", "ETH"
  qty: number;
  price: number;   // unit price
  total: number;   // qty * price
  fee: number;
  feeAsset: string;
  accountId: string;
  note: string;
}
```

### CryptoContext (`src/lib/cryptoContext.tsx`)
Provides:
- `state` — current CryptoState
- `setState(updater)` — update state + save UI prefs to localStorage
- `refresh()` — refresh prices
- `rehydrateFromBackend()` — full reload from D1
- `toast(msg, type)` — show notification

**Hydration Flow:**
1. On auth identity change (`userId`), clears stale data
2. Fetches in parallel: assets, transactions, imported files, user preferences
3. Maps backend transactions to `CryptoTx[]` via asset catalog
4. Runs one-time migration of localStorage data to backend
5. Syncs preference changes back to backend (debounced 1s)

### What's saved where:
| Data | Storage | Reason |
|---|---|---|
| Transactions | D1 (backend) | Source of truth |
| Imported files | D1 (backend) | Deduplication |
| User preferences (base, method, layout, theme) | D1 + localStorage | Cross-device sync |
| Watchlist, alerts, accounts | localStorage only | UI preferences |
| Positions, lots, P&L | Derived (not stored) | Computed from txs |

---

## 8. Pages & Features

### Dashboard (`src/pages/DashboardPage.tsx`)
- **5 KPI cards**: Portfolio Value, Unrealized P&L, Realized P&L, Total Cost, Method
- **Coin Allocation**: Custom SVG donut chart (top 12 coins + "Other")
- **Heatmap**: 3×3 grid of top 9 positions, colored by P&L %
- **Top Movers**: Table of top 3 gainers and top 3 losers
- **Watchlist**: Table showing live prices, 24h%, 7d% for watched coins
- **Top Positions**: Table showing top 10 positions with qty, avg, price, MV, P&L
- **Recent Activity**: Last 8 transactions

### Portfolio/Assets (`src/pages/PortfolioPage.tsx`)
- **View modes**: DCA View (aggregated) vs Lot View (expandable FIFO lots)
- **Configurable columns**: 18 available columns, drag-to-reorder, toggle visibility
  - Rank, Asset, Amount, Price Graph (sparkline), 1h/24h/7d %, Price, Value, Allocation %, Avg Buy, Avg Sell, P/L, Profit %, Profit/Unrealized, Realized P/L, Market Cap, Volume 24h
- **Sorting**: Click column headers to sort
- **Filtering**: Multi-select asset filter dropdown
- **Sparklines**: Real 7-day price data from CoinGecko (canvas-drawn)
- **Asset Drilldown modal**: Shows holdings, avg cost, price, MV, P&L summary, open lots table, transaction history
- **Responsive**: Card layout on mobile
- **Persisted**: View mode, visible columns, column order saved to localStorage

### Calendar (`src/pages/CalendarPage.tsx`)
- **Monthly calendar grid**: Each day shows P&L and trade count
- **Color coding**: Green for profit days, red for loss days
- **Day drilldown**: Click a day to see detailed trades with per-asset P&L
- **Coin filter**: Toggle specific coins to filter P&L calculation
- **Monthly stats**: Total P&L, active days, total entries
- **P&L calculation**: Buy → unrealized (current price - buy price), Sell → realized (FIFO)

### Ledger (`src/pages/LedgerPage.tsx`)
- **Manual Entry form**: Type (buy/sell/transfer_in/transfer_out/reward), Asset (autocomplete), Qty, Unit Price, Venue, Tags
- **CSV Import**: Drag-and-drop or file picker
  - Preview stage: Shows parsed count, skipped count, warnings
  - Commit stage: Persists to backend with progress
  - Done stage: Shows parsed/accepted/persisted/duplicates/rejected/failed counts
  - Error stage: Shows error with retry option
- **Transaction Ledger table**: Date, Type, Asset, Qty, Unit Price, Fee, Venue, Tags, Actions (edit/delete)
- **Inline editing**: Click ✎ to edit type/asset/qty/price inline
- **Backend-first**: All mutations go to D1 first, then UI refreshes from backend

### Markets (`src/pages/MarketsPage.tsx`)
- **Bubble Chart**: Canvas-based physics simulation
  - Bubble size = market cap ratio
  - Bubble color = green (positive change) / red (negative change)
  - Collision detection between bubbles
  - Hover tooltips with name, price, change%, market cap
  - Time range selector: 1h, 24h, 7d
  - Coin count: Top 100, 250, 500
- **Table View**: Sortable table with watchlist star toggle, rank, name, 1h/24h/7d %, price, market cap, volume
- **Watchlist toggle**: Star icon adds/removes from watchlist

### Alerts (`src/pages/AlertsPage.tsx`)
- **Local-only** (not persisted to backend)
- Add alerts with type (price_above/price_below), symbol, threshold
- Enable/disable/delete alerts
- Alert count badge shown in sidebar

### Vault (`src/pages/VaultPage.tsx`)
- **IndexedDB Snapshots**: Save/restore/export/delete snapshots with descriptions
- **JSON Export/Import**: Full state backup to JSON file
- **Clear All Data**: Destructive action with confirmation
- **Data Stats**: Transaction count, lots count, holdings count, import count

### Settings (`src/pages/SettingsPage.tsx`)
- **8 Layout Templates**: flux, cipher, vector, aurora, carbon, prism, noir, pulse
- **5 Theme Colors per layout** (t1–t5): Total 40 unique color schemes
- **Tracking Method**: FIFO or DCA toggle
- **Base Currency**: USD, EUR, GBP, QAR
- **Display Preferences**: Timezone, Number Format, Data Refresh Interval
- **Notifications**: Toggle for price alerts, import completion, sync status
- **Data Management**: Export/Import backup, Clear All Data

---

## 9. Price System

### Three Price Layers (priority order)

1. **Binance WebSocket** (real-time, <1s latency)
   - Singleton WebSocket connection to `wss://stream.binance.com:9443/stream`
   - Subscribes to `{pair}@ticker` streams for all portfolio + watchlist symbols
   - Auto-reconnects on disconnect (5s delay)
   - Symbol map: 130+ symbols → Binance pairs (`BTC→BTCUSDT`, etc.)

2. **Binance REST** (bootstrap, on mount)
   - `GET /api/v3/ticker/24hr?symbols=[...]`
   - Fetches all portfolio symbols in one batch request
   - Used as initial prices before WebSocket connects

3. **CoinGecko** (market data, fallback)
   - `GET /api/v3/coins/markets` — top 500 coins, polled every 3 minutes
   - Used for Markets page (bubbles/table) and sparklines
   - Rate-limit aware: exponential backoff on 429
   - Provides: price, market cap, volume, 1h/24h/7d changes, rank, image

### Backend Price Cron
- Cloudflare Cron every 2 minutes
- Fetches Binance tickers for all D1 assets with `binance_symbol`
- Stores in KV with 10-minute TTL
- Maintains rolling 24h history (720 data points)

### Price Getter Hook (`usePortfolioPriceGetter`)
Returns a function `(sym: string) => number | null` that checks:
1. Binance WS/REST spot price
2. CoinGecko live data
3. Cached state prices

---

## 10. CSV Import System

### Supported Exchanges
| Exchange | Detection Headers | Adapter |
|---|---|---|
| Binance | `Date(UTC), Pair, Side, Price` | `parseBinance()` |
| Bybit | `Symbol, Side, TradeTime` | `parseBybit()` |
| OKX | `Instrument ID` | `parseOKX()` |
| Gate.io | `Pair, Side` (or lowercase) | `parseGate()` |

### Scope
- **Spot Trade History ONLY**
- Rejects: futures, margin, options, earn, staking, P2P, copy trading, deposits, withdrawals

### Import Pipeline
```
File → parseCSV() → detectExchange() → exchangeAdapter() → normalizeSymbol() → deduplicate → ParseResult
```

1. **CSV Parser** (`csv.ts`): Handles quoted fields, BOM, comma-separated
2. **Exchange Detector** (`detector.ts`): Matches header signatures, rejects non-spot formats
3. **Exchange Adapters** (`binance.ts`, `bybit.ts`, `okx.ts`, `gate.ts`): Parse exchange-specific columns
4. **Symbol Normalization** (`symbolAliases.ts`): XBT→BTC, strip leading multipliers (1000PEPE→PEPE), extract base from pair (BTCUSDT→BTC)
5. **Deduplication**: By `exchange:externalId` or composite fingerprint `exchange:timestamp:symbol:side:qty:price`
6. **File Hashing**: SHA-256 of file content for duplicate file detection

### NormalizedRow
```typescript
interface NormalizedRow {
  timestamp: number;     // unix ms
  exchange: Exchange;    // "binance" | "bybit" | "okx" | "gate"
  symbol: string;        // "BTCUSDT"
  side: "buy" | "sell";
  qty: number;
  unitPrice: number;
  grossValue: number;
  feeAmount: number;
  feeAsset: string;
  externalId: string;    // Trade ID from exchange
  note: string;
  raw: Record<string, string>;
}
```

### Backend Persistence Flow
1. Frontend resolves symbols to D1 asset IDs via `resolveAssetId()`
2. Builds batch payload with deterministic `external_id` for idempotency
3. Calls `POST /api/transactions/batch` (max 500 per batch)
4. Records file metadata via `POST /api/imported-files` (409 on duplicate)
5. Calls `rehydrateFromBackend()` to refresh UI from D1

---

## 11. Portfolio Calculation Engine

### Location: `src/lib/derivePortfolio.ts`

### FIFO Lot Tracking
```
Sort transactions by timestamp (ascending)
For each transaction:
  IN types (buy, reward, transfer_in, deposit, positive adjustment):
    → Create new lot { qty, unitCost }
  OUT types (sell, transfer_out, withdrawal, fee, negative adjustment):
    → Consume lots FIFO (earliest first)
    → For sells: realized PnL = proceeds - cost consumed
```

### DerivedPosition
```typescript
interface DerivedPosition {
  sym: string;          // "BTC"
  qty: number;          // Total remaining quantity
  cost: number;         // Total cost basis
  price: number | null; // Current market price
  mv: number | null;    // Market value (price × qty)
  unreal: number | null;// Unrealized P&L (mv - cost)
  avg: number;          // Average cost per unit
  lots: DerivedLot[];   // Open FIFO lots
  realizedPnl: number;  // Total realized P&L from sells
  txCount: number;      // Number of transactions for this asset
}
```

### PortfolioSummary
```typescript
interface PortfolioSummary {
  positions: DerivedPosition[];  // Sorted by MV descending
  totalMV: number;
  totalCost: number;
  totalPnl: number;              // totalMV - totalCost
  totalPnlPct: number;           // (totalPnl / totalCost) × 100
  realizedPnl: number;
  assetCount: number;
  txCount: number;
}
```

### useUnifiedPortfolio Hook
Single hook used by Dashboard, Portfolio, and Calendar pages:
```typescript
const portfolio = useUnifiedPortfolio();
// Returns: { positions, totalMV, totalCost, totalPnl, totalPnlPct, realizedPnl, assetCount, txCount, base, method, getPosition }
```

---

## 12. Design System

### Architecture
The design system is **entirely CSS custom properties** defined in `src/index.css` (1264 lines). No Tailwind utility classes are used for theming — all colors come from CSS variables.

### Layout System (8 layouts)
Each layout defines structural variables:
```css
--lt-font: 'Inter', sans-serif;     /* Primary font */
--lt-font-mono: 'JetBrains Mono';   /* Monospace font */
--lt-radius: 12px;                  /* Border radius */
--lt-radius-sm: 8px;
--lt-radius-lg: 16px;
--lt-shadow: 0 4px 20px rgba(0,0,0,.06);
--lt-sidebar-w: 180px;
--lt-topbar-h: 54px;
--lt-tr: 0.18s ease;                /* Transition timing */
```

| Layout | Font | Style | Radius |
|---|---|---|---|
| flux | Inter | Modern SaaS, light | 12px |
| cipher | JetBrains Mono | Dark terminal, hacker | 4px |
| vector | Plus Jakarta Sans | Corporate, light | 8px |
| aurora | Plus Jakarta Sans | Gradient SaaS, light | 20px |
| carbon | JetBrains Mono | Dark monitor | 4px |
| prism | Space Grotesk | Bold fintech, light | 6px |
| noir | Inter | Luxury dark | 10px |
| pulse | DM Sans | Neon crypto, dark, glassmorphism | 22px |

### Theme System (5 themes per layout = 40 total)
Each theme defines color variables:
```css
--bg: #f8faff;           /* Page background */
--panel: #ffffff;        /* Card/panel background */
--panel2: #f0f4ff;       /* Secondary panel */
--panel3: #e8effe;       /* Tertiary panel */
--text: #0f172a;         /* Primary text */
--muted: #64748b;        /* Secondary text */
--muted2: #94a3b8;       /* Tertiary text */
--line: rgba(15,23,42,.09);  /* Border color */
--brand: #4f46e5;        /* Primary accent */
--brand2: #7c3aed;       /* Secondary accent */
--brand3: rgba(79,70,229,.1); /* Accent background */
--good: #16a34a;         /* Positive/profit */
--bad: #dc2626;          /* Negative/loss */
--warn: #d97706;         /* Warning */
--sidebar-bg: #ffffff;
--topbar-bg: rgba(255,255,255,.95);
--card-bg: #ffffff;
--input-bg: rgba(79,70,229,.05);
--glow: rgba(79,70,229,.15);
--kpi-accent: linear-gradient(135deg,#4f46e5,#7c3aed);
```

### Layout/Theme Applied via
```javascript
document.body.setAttribute("data-layout", state.layout);
document.body.setAttribute("data-theme", state.theme);
document.documentElement.style.setProperty("--app-font", fontMap[layout]);
```

### Component Classes (CSS)
All UI components use custom CSS classes (not shadcn):
- `.app` — Main grid layout (sidebar + content)
- `.sidebar` — Left navigation
- `.topbar` — Top header bar
- `.panel`, `.panel-head`, `.panel-body` — Card containers
- `.kpi-card`, `.kpi-val`, `.kpi-lbl`, `.kpi-sub` — KPI cards
- `.btn`, `.btn.secondary`, `.btn.danger`, `.btn.tiny` — Buttons
- `.inp`, `.form-field`, `.form-label` — Form inputs
- `.pill` — Tag/badge
- `.seg` — Segmented control
- `.mono` — Monospace text
- `.good`, `.bad` — Green/red text
- `.muted` — Muted text
- `.tableWrap`, `table` — Data tables
- `.cal-grid`, `.cal-day` — Calendar
- `.modalBg`, `.modal` — Modal overlay
- `.toast` — Toast notification
- `.searchBox` — Global search
- `.import-drop` — CSV drag-and-drop zone

### Fonts (Google Fonts)
```
Inter, JetBrains Mono, Space Grotesk, Sora, Plus Jakarta Sans, 
DM Sans, Outfit, Fira Code, IBM Plex Mono, Roboto
```

### Responsive
- Mobile breakpoint: `768px`
- Sidebar collapses to bottom nav on mobile
- Tables switch to card layouts on mobile
- Grid layouts switch to single column

---

## 13. Data Flow Diagrams

### Login → Data Hydration
```
User signs in (Clerk)
  → userId changes
  → CryptoProvider effect fires
  → Parallel fetch: [assets, transactions, importedFiles, preferences]
  → Map transactions to CryptoTx[] via asset catalog
  → Set state (txs, importedFiles, syncStatus: "synced")
  → Run one-time localStorage migration (if legacy data exists)
```

### CSV Import Flow
```
User drops CSV file
  → parseCSV() + hashFile()
  → Check duplicate (local + backend imported_files)
  → detectExchange(headers)
  → parseExchange(rows) → NormalizedRow[]
  → normalizeSymbol() on each row
  → Deduplicate by external_id or fingerprint
  → Show preview (parsed count, skipped, warnings)

User clicks "Commit"
  → Resolve symbols to D1 asset IDs
  → Build batch payload with deterministic external_ids
  → POST /api/transactions/batch (max 500 per batch)
  → POST /api/imported-files (record metadata)
  → rehydrateFromBackend() (full state refresh)
  → Show result counts
```

### Price Update Flow
```
[Backend Cron - every 2min]
  → Fetch assets with binance_symbol from D1
  → GET Binance /api/v3/ticker/24hr
  → Store in KV (prices:latest, prices:history)

[Frontend - on mount]
  → getSpotPrices() via Binance REST (bootstrap)
  → subscribeLivePrices() via Binance WebSocket (real-time)
  → CoinGecko /coins/markets (for Markets page, polled 3min)

[Price resolution]
  → Binance WS > Binance REST > CoinGecko > cached state > null
```

---

## 14. Deployment

### Frontend
- Hosted on Lovable (auto-deploy from editor)
- Build: `vite build`
- Environment variables baked at build time

### Backend
- Cloudflare Worker deployed via `wrangler deploy`
- CI/CD: `.github/workflows/deploy-backend.yml`
- Database init: `npm run db:init:remote` (runs schema.sql + assets.sql)

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

## 15. Environment Variables

### Frontend (Vite — baked at build time)
| Variable | Required | Description |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Optional | Clerk publishable key (has fallback test key) |
| `VITE_WORKER_API_URL` | Required | Cloudflare Worker URL (e.g., `https://cryptotracker-api.example.workers.dev`) |

### Backend (Cloudflare Worker Secrets)
| Variable | Required | Description |
|---|---|---|
| `CLERK_JWKS_URL` | Required | `https://<clerk-domain>/.well-known/jwks.json` |
| `ALLOWED_ORIGINS` | Optional | Comma-separated allowed CORS origins |

### Backend (Cloudflare Bindings — in wrangler.toml)
| Binding | Type | Description |
|---|---|---|
| `DB` | D1 | SQLite database |
| `PRICE_KV` | KV | Price cache namespace |

---

## Symbol Resolution System

### symbolAliases.ts
- Maps exchange-specific symbols to canonical: `XBT→BTC`, `BCHABC→BCH`, `RNDR→RENDER`
- Strips leading multipliers: `1000PEPE→PEPE`, `1000SHIB→SHIB`
- Extracts base from pairs: `BTCUSDT→BTC`, `ETH/USDT→ETH`, `SOL-PERP→SOL`
- Quote currencies stripped: USDT, USDC, BUSD, BTC, ETH, BNB, EUR, etc.

### assetResolver.ts
- `getAssetCatalog()` — cached D1 asset list (60s TTL)
- `resolveAssetSymbol(raw)` — normalize any raw symbol string
- `resolveAssetId(raw, assets)` — find D1 asset ID by symbol or binance_symbol

### priceProvider.ts
Maps 130+ crypto symbols to Binance trading pairs and CoinGecko IDs for price resolution.

---

## Migration System (`src/lib/migration.ts`)

One-time migration from localStorage to D1:
1. Checks `hasLegacyData()` — looks for txs/importedFiles in old localStorage format
2. Resolves each tx's asset symbol to D1 asset ID
3. Builds `CreateTransactionInput[]` with deterministic `external_id: migration:${id}`
4. Batch-creates via API (idempotent — safe to retry)
5. Migrates imported file metadata (409 = already done = fine)
6. Calls `markMigrationComplete()` — sets flag in localStorage, strips business data

---

## Key Design Decisions

1. **No stored positions/holdings**: Everything is derived from the transaction ledger via FIFO. This prevents state drift.
2. **Backend-first writes**: CSV imports and manual entries go to D1 before updating UI. Prevents "phantom data" that disappears on refresh.
3. **Deterministic external_ids**: Enables idempotent imports — re-importing the same CSV won't create duplicates.
4. **Dual price sources**: Binance WebSocket for portfolio (real-time), CoinGecko for market overview (rate-limited).
5. **Massive design system**: 8 layouts × 5 themes = 40 unique visual presets, all in CSS custom properties.
6. **No react-router**: Simple state-based navigation via `page` state variable.
7. **Asset catalog as join table**: Transactions reference asset IDs, enabling clean JOINs and symbol normalization.
