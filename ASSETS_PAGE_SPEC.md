# Assets (Portfolio) Page — Complete Specification

> Recreate this page exactly from this spec. Every feature, calculation, UI element, and interaction is documented.

---

## 1. PURPOSE

The Assets page displays the user's crypto portfolio positions derived from their transaction ledger. It shows live prices, P&L, allocation, sparkline charts, and supports two view modes (DCA aggregated vs. individual lot drill-down). It is fully responsive with a card layout on mobile.

---

## 2. DATA PIPELINE

### 2.1 Source of Truth
- All data derives from `CryptoTx[]` (the transaction array in global state).
- NO separate "holdings" or "balances" table — everything is computed from transactions.

### 2.2 Transaction Shape (`CryptoTx`)
```typescript
interface CryptoTx {
  id: string;
  asset: string;       // e.g. "BTC", "ETH"
  type: string;        // "buy" | "sell" | "transfer_in" | "transfer_out" | "reward" | "fee" | "adjustment"
  qty: number;
  price: number;       // unit price at time of trade
  fee: number;         // fee amount
  ts: number;          // unix ms timestamp
  venue?: string;
  note?: string;
  source?: string;
}
```

### 2.3 FIFO Lot Engine (`derivePortfolio.ts`)

The core engine processes all transactions chronologically and builds FIFO lots:

#### Types
```typescript
interface DerivedLot {
  id: string;        // "lot_1", "lot_2", etc.
  ts: number;        // unix ms of the buy/inflow
  asset: string;     // normalized symbol
  qty: number;       // original quantity
  qtyRem: number;    // remaining quantity after sells consumed it
  unitCost: number;  // cost per unit (includes fee for buys)
  tag: string;       // the tx type: "buy", "reward", "transfer_in", etc.
}

interface DerivedPosition {
  sym: string;
  qty: number;         // total remaining quantity
  cost: number;        // total cost basis (sum of qtyRem * unitCost for all open lots)
  price: number | null; // current live price
  mv: number | null;    // market value = price * qty
  unreal: number | null; // unrealized P&L = mv - cost
  avg: number;          // weighted average cost = cost / qty
  lots: DerivedLot[];   // open lots only (qtyRem > 1e-10)
  realizedPnl: number;  // from closed lots
  txCount: number;      // number of transactions for this asset
}

interface PortfolioSummary {
  positions: DerivedPosition[];
  totalMV: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  realizedPnl: number;
  assetCount: number;
  txCount: number;
}
```

#### FIFO Algorithm
1. Sort all transactions by timestamp ascending.
2. For each transaction:
   - Normalize the asset symbol (uppercase, apply alias map like XBT→BTC, strip leading digits like 1000PEPE→PEPE).
   - **Inflow types** (`buy`, `reward`, `transfer_in`, `deposit`, positive `adjustment`):
     - Create a new lot.
     - For `buy`: `unitCost = (qty * price + fee) / qty`
     - For others: `unitCost = qty * max(price, 0) / qty`
   - **Outflow types** (`sell`, `transfer_out`, `withdrawal`, `fee`, negative `adjustment`):
     - Consume lots in FIFO order (earliest first).
     - For each lot consumed, reduce `qtyRem` by the amount taken.
     - For `sell` specifically: calculate realized P&L = `(qty * sellPrice - fee) - costConsumed`
3. After processing all transactions:
   - Filter lots where `qtyRem > 1e-10` (these are "open lots").
   - Sum open lots for each asset to get position totals.
   - Positions with `totalQty <= 1e-10` are excluded (fully closed).
   - Sort positions by market value descending.

#### Portfolio Totals
```
totalMV = sum of all position market values
totalCost = sum of all position costs
totalPnl = totalMV - totalCost
totalPnlPct = (totalPnl / totalCost) * 100
realizedPnl = sum of all position realized P&L
```

### 2.4 Price Resolution (3-layer cascade)

The `usePortfolioPriceGetter` hook provides prices in priority order:
1. **Binance WebSocket** — real-time spot price via `spotPrices[sym]`
2. **CoinGecko API** — `getPrice(sym).current_price` from periodic polling
3. **Cached state prices** — `state.prices[sym]` from backend KV store

Returns `null` if no price available (asset shows "—" for price/value).

### 2.5 Live Market Data (`useLivePrices`)

Additionally fetches from CoinGecko for each position:
- `current_price`
- `price_change_percentage_1h_in_currency`
- `price_change_percentage_24h_in_currency`
- `price_change_percentage_7d_in_currency`
- `market_cap`
- `total_volume`
- `id` (CoinGecko coin ID, used for sparkline fetching)

---

## 3. VIEW MODES

### 3.1 DCA View (default)
- One row per asset showing aggregated position.
- Clicking a row opens the **Asset Drilldown Modal**.

### 3.2 Lot View
- One parent row per asset (bold, font-weight 700).
- Shows lot count badge: `· {n} lots`
- Parent row has expand/collapse toggle (`▸` / `▾`).
- Clicking parent row toggles expand/collapse.
- Expanded child rows appear below the parent, styled with:
  - `background: var(--panel2)`
  - `fontSize: 12`
  - `paddingLeft: 28` on the asset cell
  - Shows lot date, tag (uppercase), remaining qty, unit cost, cost basis, individual lot P&L.
- Child lots sorted by buy date ascending.
- Clicking a child lot row opens the Asset Drilldown Modal.

### 3.3 Persistence
- View mode persisted to `localStorage` key `"portfolio_view_mode"` (values: `"dca"` | `"lot"`).
- Expanded assets tracked in component state (Set of symbols), NOT persisted.

---

## 4. COLUMNS

### 4.1 All Available Columns
| Key | Label | Default Visible | Sortable |
|-----|-------|----------------|----------|
| `rank` | # | ✅ | ❌ |
| `asset` | Asset | ✅ | ❌ |
| `amount` | Amount | ✅ | ✅ (`qty`) |
| `sparkline` | Price Graph | ✅ | ❌ |
| `change1h` | 1h % | ✅ | ❌ |
| `change24h` | 24h % | ✅ | ❌ |
| `change7d` | 7d % | ✅ | ❌ |
| `price` | Price | ✅ | ✅ |
| `total` | Value | ✅ | ✅ |
| `allocation` | Allocation % | ✅ | ✅ |
| `avg` | Avg Buy | ✅ | ✅ |
| `avgSell` | Avg Sell | ❌ | ❌ |
| `pnl` | P/L | ✅ | ✅ |
| `pnlPct` | Profit % | ✅ | ❌ |
| `profitAbs` | Profit / Unrealized | ❌ | ❌ |
| `realizedPnl` | Realized P/L | ❌ | ✅ |
| `marketCap` | Market Cap | ❌ | ❌ |
| `volume` | Volume 24h | ❌ | ❌ |

### 4.2 Column Configurator
- Toggle button `"⚙ Columns"` in toolbar.
- Opens a panel with draggable column pills.
- Each pill shows column label, is draggable for reorder, and clickable to toggle visibility.
- Active columns: `background: var(--brand3)`, `color: var(--brand)`, `fontWeight: 700`, `border: var(--brand)`.
- Inactive columns: `background: var(--panel2)`, `color: var(--muted)`, `fontWeight: 400`.
- Drag handle: `⠿` icon on left of each pill.
- Drag visual: dragged pill gets `opacity: 0.5`.

### 4.3 Column Persistence
- Visible columns: `localStorage` key `"portfolio_visible_cols"` — JSON array of visible key strings.
- Column order: `localStorage` key `"portfolio_col_order"` — JSON array of all keys in display order.

### 4.4 Sorting
- Default sort: `total` descending.
- Click sortable column header to sort; click again to reverse direction.
- Arrow indicator: `↑` for asc, `↓` for desc, shown next to active sort column label.
- Sorting only applies to parent rows (lot child rows maintain buy-date ascending order within their parent).

---

## 5. CELL RENDERING DETAILS

### 5.1 Rank Cell
- Sequential number `i + 1`, mono font, muted color.

### 5.2 Asset Cell
- Symbol in mono font, `fontWeight: 900`.
- In lot view: expand icon (`▸`/`▾`) before symbol if lots exist.
- In lot view: lot count badge `· {n} lots` after symbol, `fontSize: 10`, muted.

### 5.3 Amount Cell
- `fmtQty(qty)` — formatted quantity with appropriate decimal places.

### 5.4 Sparkline Cell
- Canvas-based sparkline chart, 100×30px.
- Shows 7-day price history from CoinGecko.
- Line color: `var(--good)` if 7d change ≥ 0, `var(--bad)` if negative.
- Line width: 1.5px.
- Data fetched via `useSparklineData` hook (sequential fetches with 1.5s delay, max 20 coins, cached).

### 5.5 Change Pill Cells (1h, 24h, 7d)
- Shows `▲` or `▼` prefix based on sign.
- Value formatted to 2 decimal places with `%`.
- CSS class `good` (green) or `bad` (red).
- Zero values show `—` in muted color.
- `fontWeight: 700`, `fontSize: 11`.

### 5.6 Price Cell
- `fmtPx(price)` — formatted with appropriate precision.
- Shows `—` if price is null.

### 5.7 Value Cell
- `fmtTotal(total)` — formatted total value.
- `fontWeight: 700`.

### 5.8 Allocation Cell
- Visual progress bar: 40×6px container with `var(--line)` background, filled portion with `var(--brand)`.
- Percentage text: `mono`, `fontSize: 11`, formatted to 1 decimal place.
- Formula: `(positionTotal / totalMV) * 100`, capped at 100% for the bar width.

### 5.9 Avg Buy Cell
- `fmtPx(avg)` if avg > 0, else `—`.

### 5.10 P/L Cell (compound)
- Top line: absolute P&L value, `fontWeight: 900`, mono font.
- Color: `var(--good)` if ≥ 0, `var(--bad)` if negative.
- Prefix: `+` for positive, `-` for negative.
- Formatted with no decimal places.
- Bottom line: percentage with `▲`/`▼`, `fontSize: 10`, `fontWeight: 600`.

### 5.11 Profit % Cell
- Same format as change pills: `▲`/`▼` + percentage to 2 decimals.
- `fontWeight: 700`, `fontSize: 11`.

### 5.12 Realized P/L Cell
- `fmtFiat(realizedPnl, base)` with `+` prefix if positive.
- Color: `var(--good)` or `var(--bad)`.
- `fontWeight: 700`.

### 5.13 Market Cap / Volume Cells
- `formatCompact(n)` — compact formatting:
  - ≥1T → `"1.2T"`
  - ≥1B → `"42B"`
  - ≥1M → `"156M"`
  - else → `n.toLocaleString()`

### 5.14 Lot Child Row Cells
- `rank`: empty `<td>`
- `asset`: indented (paddingLeft 28), shows date + tag (uppercase), both muted, fontSize 10/9
- `amount`: remaining qty, muted, fontSize 11
- `price`: shows unit cost (not current price), muted
- `total`: lot cost basis (qtyRem × unitCost)
- `pnl`: individual lot P&L if price available, else `—`
- Most other cells are empty `<td>`

---

## 6. KPI CARDS (Top Summary)

Three cards in a row using class `kpis`:

### Card 1: Portfolio Value
- Label: `"PORTFOLIO VALUE"`
- Value: `fmtTotal(totalMV)` — total market value of filtered positions
- Sub: `"{n} assets"` count

### Card 2: Total P&L
- Label: `"TOTAL P&L"`
- Value: `fmtTotal(totalPnl)` with `+` prefix if positive
- CSS class: `good` or `bad` based on sign
- Sub: `"{pct}%"` formatted to 2 decimals

### Card 3: Total Cost
- Label: `"TOTAL COST"`
- Value: `fmtTotal(totalCost)`

**Note:** KPIs respect the current filter — they show totals for filtered assets only.

---

## 7. TOOLBAR

Horizontal flex container with gap 8, flex-wrap.

### 7.1 View Mode Toggle
- Segmented button with two options: `"DCA View"` / `"Lot View"`.
- Active state: `background: var(--brand)`, `color: var(--brand-fg, #fff)`, `fontWeight: 800`.
- Inactive: `background: transparent`, `color: var(--fg)`, `fontWeight: 400`.
- Container: `borderRadius: 6`, `border: 1px solid var(--line)`.

### 7.2 Asset Filter
- Dropdown button showing current filter state:
  - No filter: `"All Assets"`
  - ≤3 selected: comma-separated symbol list
  - >3 selected: `"{n} assets"`
- Clear button `✕` appears when filter active.
- Dropdown panel:
  - Search input at top
  - Checkbox list of all portfolio symbols
  - Selected items: `background: var(--brand3)`, `fontWeight: 700`, `color: var(--brand)`
  - Click outside closes dropdown
  - `minWidth: 200`, `maxHeight: 280`, overflow auto

### 7.3 Columns Button
- `"⚙ Columns"` — toggles column configurator panel.

### 7.4 Status Pill
- `"Live prices · Top 500"` — informational badge.

---

## 8. ASSET DRILLDOWN MODAL

Opens when clicking a row in DCA view, or clicking a lot child row in Lot view.

### 8.1 Layout
- Modal overlay: `className="modalBg open"`, click outside to close.
- Modal container: `maxWidth: 720`.
- Header: symbol + `"— Asset Detail"`, close button `"✕ Close"`.

### 8.2 KPI Row (4 columns)
| Holdings | Avg Cost | Current Price | Market Value |
|----------|----------|---------------|-------------|
| `fmtQty(qty)` | `$fmtPx(avgCost)` | `fmtPx(price)` or `—` | `fmtFiat(mv, base)` or `—` |

### 8.3 P&L Summary (3 columns)
| Cost Basis | Unrealized P&L | Realized P&L |
|-----------|----------------|-------------|
| `fmtFiat(totalCost, base)` | `±fmtFiat(unrealizedPnl, base) (pct%)` | `±fmtFiat(realizedPnl, base)` |

Colors: `good`/`bad` class based on sign.

### 8.4 Open Lots Table
- Header: `"Open Lots ({n})"` — uppercase, muted, fontSize 11, fontWeight 900.
- Columns: Date | Qty | Remaining | Unit Cost | Cost Basis
- Date: `month short, day, year 2-digit`
- Cost Basis per lot: `qtyRem * unitCost`

### 8.5 Transaction History Table
- Header: `"Transaction History ({n})"` — same styling as lots header.
- Shows last 50 transactions for this asset, sorted newest first.
- Columns: Date | Type | Qty | Price | Value | Fee
- Type cell: `fontWeight: 900`, `good` class for buy, `bad` for sell.
- Fee: shows `—` if zero.

### 8.6 Footer
- `"{n} open lots · {n} transactions"` — fontSize 10, muted.

---

## 9. MOBILE LAYOUT

When `useIsMobile()` returns true (screen width ≤ 768px):

### 9.1 Card Layout
- Each position renders as a card instead of a table row.
- Card: `background: var(--panel)`, `border: 1px solid var(--line)`, `borderRadius: 8`, `padding: 12`, `marginBottom: 8`.

### 9.2 Card Header
- Left: symbol (mono, fontWeight 900, fontSize 14) + lot count if lot view.
- Right: total value (mono, fontWeight 700) + P&L percentage with arrow.
- Clicking header: toggles lot expand (lot view) or opens drilldown (DCA view).

### 9.3 Card Details Grid
- 2-column grid, fontSize 11.
- Fields: Qty, Price, Avg, Cost, Alloc, P/L.
- Labels in muted, values in mono.

### 9.4 Mobile Lot Cards
- When expanded in lot view, shows child lot cards.
- Styled with `borderLeft: 2px solid var(--line)`, `background: var(--panel2)`, `borderRadius: 0 6px 6px 0`.
- 2-column grid showing Date, Qty, Unit Cost, Cost, and P/L.

### 9.5 Tap for Details
- In DCA view, cards show `"Tap for details →"` link at bottom.
- `color: var(--brand)`, `fontSize: 10`, centered.

---

## 10. SPARKLINE COMPONENT

### Canvas Implementation
```typescript
// 100×30 canvas
// Plots data points as a polyline
// Y-axis: normalized to fill canvas height minus 4px padding (2px top/bottom)
// X-axis: evenly distributed
// Line width: 1.5
// Color: var(--good, #16a34a) if positive, var(--bad, #dc2626) if negative
// Minimum 2 data points required
```

### Data Fetching (`useSparklineData`)
- Fetches 7-day daily price history from CoinGecko: `/coins/{id}/market_chart?vs_currency=usd&days=7&interval=daily`
- Sequential fetching with 1.5s delay between requests (rate limit protection).
- Maximum 20 coins per batch.
- Results cached in module-level Map (survives re-renders).
- Returns `Map<string, number[]>` mapping coinId to price array.

---

## 11. FORMATTING UTILITIES

```typescript
// Fiat formatting (e.g. "$1,234.56")
fmtFiat(n: number, currency?: string): string

// Total formatting - compact for large numbers
fmtTotal(n: number): string

// Quantity formatting (e.g. "0.00123456")
fmtQty(n: number): string

// Price formatting with appropriate precision
fmtPx(n: number): string

// Compact number formatting
formatCompact(n: number): string
// >= 1T → "1.2T"
// >= 1B → "42B"  
// >= 1M → "156M"
// else → n.toLocaleString()
```

---

## 12. CSS CLASSES & DESIGN TOKENS

### Custom CSS Classes Used
- `.kpis` — KPI card container (flex row)
- `.kpi-card` — individual KPI card
- `.kpi-lbl` — KPI label
- `.kpi-val` — KPI value
- `.kpi-sub` — KPI subtitle
- `.panel` — section container
- `.panel-head` — section header with title + badge
- `.panel-body` — section content
- `.tableWrap` — scrollable table container
- `.cal-stat` — stat block (used in drilldown)
- `.modalBg` — modal overlay
- `.modal` — modal container
- `.modalHead` — modal header
- `.modalBody` — modal content
- `.btn` — button base
- `.btn.secondary` — secondary button style
- `.btn.tiny` — small button
- `.pill` — badge/tag
- `.mono` — monospace font
- `.muted` — muted text color
- `.good` — positive/green color
- `.bad` — negative/red color

### CSS Variables Used
- `--panel` — panel background
- `--panel2` — secondary panel/nested background
- `--line` — border color
- `--fg` — foreground text
- `--muted` — muted text
- `--brand` — primary brand color
- `--brand3` — brand tint for backgrounds
- `--brand-fg` — text on brand background (default #fff)
- `--good` — positive/profit color (default #16a34a)
- `--bad` — negative/loss color (default #dc2626)
- `--lt-font-mono` — monospace font family

---

## 13. STATE MANAGEMENT SUMMARY

| State | Storage | Scope |
|-------|---------|-------|
| View mode (dca/lot) | localStorage | Persisted |
| Visible columns | localStorage | Persisted |
| Column order | localStorage | Persisted |
| Sort column & direction | component state | Session only |
| Asset filter selection | component state | Session only |
| Expanded assets (lot view) | component state | Session only |
| Drilldown symbol | component state | Session only |
| Column configurator open | component state | Session only |

---

## 14. DEPENDENCIES

| Dependency | Purpose |
|-----------|---------|
| `useUnifiedPortfolio()` | Derived positions, lots, P&L from transactions |
| `useLivePrices()` | CoinGecko market data (changes, market cap, volume) |
| `useSparklineData()` | 7-day price history for sparkline charts |
| `useIsMobile()` | Responsive breakpoint detection |
| `useCrypto()` | Global state (transactions, base currency) |
| `AssetDrilldown` | Modal component for asset detail |
| `Sparkline` | Canvas sparkline chart component |
| `AssetFilter` | Dropdown multi-select filter component |

---

## 15. EDGE CASES

1. **No positions**: Shows `"No assets. Import trades in the Ledger."` message.
2. **No price available**: Shows `—` for price, value, and P&L fields.
3. **Zero cost basis**: P&L percentage shows 0%.
4. **Tiny remaining quantities** (< 1e-10): Treated as zero, position excluded.
5. **Stablecoin prices**: Hardcoded to $1.00 by price provider.
6. **CoinGecko rate limits**: Sparklines fetched sequentially with 1.5s delays, max 20.
7. **Symbol normalization**: `XBT→BTC`, `1000PEPE→PEPE`, `BETH→ETH` etc. via alias map.
