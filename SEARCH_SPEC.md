# Global Search & Autocomplete — Complete Technical Specification

> Standalone build spec covering every search and autocomplete feature across all pages.

---

## 1. Architecture Overview

Two distinct search/autocomplete systems:

| Component | File | Used In | Purpose |
|-----------|------|---------|---------|
| `GlobalSearch` | `src/components/GlobalSearch.tsx` | `Topbar.tsx` (all pages) | Cross-app navigation search |
| `CoinAutocomplete` | `src/components/CoinAutocomplete.tsx` | `LedgerPage.tsx` (Manual Entry) | Coin symbol input with autocomplete |

Both share the same price data source: `useLivePrices()` hook.

---

## 2. Topbar Integration

**File:** `src/components/Topbar.tsx`

```tsx
export default function Topbar({ title, sub, onNav }: {
  title: string;
  sub: string;
  onNav: (p: string) => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="pageTitle">{title}</div>
        <div className="pageSub" dangerouslySetInnerHTML={{ __html: sub }} />
      </div>
      <div className="topRight">
        <GlobalSearch onNav={onNav} />
      </div>
    </header>
  );
}
```

- Topbar appears on **every page** via `AppShell`
- `onNav` prop routes to any page by key
- `sub` uses `dangerouslySetInnerHTML` for `&amp;` entity support

### Page Titles (from App.tsx)

```typescript
const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs, Allocation, Heatmap"],
  assets: ["Assets", "Positions, P&amp;L, Lots"],
  calendar: ["Calendar", "Daily P&amp;L, Per Coin"],
  ledger: ["Ledger", "Journal, Manual Entry, CSV Import"],
  markets: ["Live Markets", "Bubbles, Prices, Watchlist"],
  alerts: ["Alerts", "Price Alerts, Notifications"],
  vault: ["Vault", "Snapshots, Backups, Export"],
  settings: ["Settings", "Layout, Themes, Data"],
};
```

---

## 3. GlobalSearch Component

**File:** `src/components/GlobalSearch.tsx` (150 lines)

### 3.1 Props

```typescript
interface Props {
  onNav: (page: string) => void;
}
```

### 3.2 State

| State var | Type | Default | Purpose |
|-----------|------|---------|---------|
| `query` | `string` | `""` | Search input value |
| `open` | `boolean` | `false` | Dropdown visibility |
| `selected` | `number` | `0` | Keyboard-highlighted index |

### 3.3 Data Sources

```typescript
const { coins } = useLivePrices();   // CoinGecko market data (LiveCoin[])
const { state } = useCrypto();        // Portfolio state (txs for positions)
```

### 3.4 Search Result Interface

```typescript
interface SearchResult {
  type: "coin" | "page" | "position";
  id: string;
  label: string;
  sub: string;
  icon?: string;
}
```

### 3.5 Searchable Pages

```typescript
const PAGES = [
  { id: "dashboard", label: "Dashboard", sub: "KPIs · Allocation · Heatmap" },
  { id: "assets", label: "Assets", sub: "Positions · P&L · Lots" },
  { id: "calendar", label: "Calendar", sub: "Daily P&L · Per Coin" },
  { id: "ledger", label: "Ledger", sub: "Journal · Import · Manual Entry" },
  { id: "markets", label: "Markets", sub: "Live Prices · Bubbles" },
  { id: "settings", label: "Settings", sub: "Layout · Themes · Data" },
];
```

**Note:** `alerts` and `vault` pages are NOT in the search index.

### 3.6 Search Algorithm

Executed on every render when `query` is non-empty. **No debounce.**

**Priority order:**

1. **Pages** — match `label` or `sub` (case-insensitive `.includes()`)
   - Result type: `"page"`
   - Label: page label
   - Sub: page sub-description

2. **Portfolio Positions** — unique asset symbols from `state.txs`
   - Extracts: `new Set(state.txs.map(t => t.asset.toUpperCase()))`
   - Match: symbol `.includes(query)` (case-insensitive)
   - Result type: `"position"`
   - Label: symbol (e.g., "BTC")
   - Sub: "Your position"

3. **Coins** — from CoinGecko `coins` array
   - Match: `symbol` or `name` `.includes(query)` (case-insensitive)
   - Capped at 8 matches
   - **Dedup:** Skips if same symbol already exists as a `"position"` result
   - Result type: `"coin"`
   - Label: `"{SYMBOL} · {name}"` (e.g., "BTC · Bitcoin")
   - Sub: `"${current_price.toLocaleString()} · #{market_cap_rank}"`

**Total results capped at 12.**

### 3.7 Navigation Actions

```typescript
const handleSelect = (r: SearchResult) => {
  if (r.type === "page") onNav(r.id);        // Navigate to page
  else if (r.type === "position") onNav("assets"); // Go to Assets page
  else onNav("markets");                      // Go to Markets page
  setQuery("");
  setOpen(false);
};
```

### 3.8 Keyboard Shortcuts

**Global (document-level):**
- `⌘K` / `Ctrl+K` → Open search, focus input
- `Escape` → Close dropdown

**Input-level:**
- `ArrowDown` → Move selection down (clamped to results length)
- `ArrowUp` → Move selection up (min 0)
- `Enter` → Select highlighted result

### 3.9 Click Outside

```typescript
useEffect(() => {
  const h = (e: MouseEvent) => {
    if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("mousedown", h);
  return () => document.removeEventListener("mousedown", h);
}, []);
```

### 3.10 UI Structure

**Search Input:**
```jsx
<div className="searchBox" ref={wrapRef} style={{ position: "relative" }}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" strokeLinecap="round" />
  </svg>
  <input
    placeholder="Search… ⌘K"
    value={query}
    onChange={e => { setQuery(e.target.value); setOpen(true); setSelected(0); }}
    onFocus={() => query && setOpen(true)}
    onKeyDown={handleKeyDown}
  />
</div>
```

**Dropdown Panel:**
```css
position: absolute;
top: 100%;
left: 0;
right: 0;
background: var(--panel);
border: 1px solid var(--line);
borderRadius: var(--lt-radius-sm, 8px);
zIndex: 999;
maxHeight: 360px;
overflowY: auto;
boxShadow: 0 8px 30px rgba(0,0,0,.25);
marginTop: 4px;
```

**Result Item:**
```css
padding: 8px 12px;
cursor: pointer;
fontSize: 12px;
background: i === selected ? var(--brand3) : transparent;  /* Highlight selected */
borderBottom: 1px solid var(--line2);
display: flex;
justifyContent: space-between;
alignItems: center;
```

**Result item content:**
- Left side:
  - Label: `fontWeight: 700, color: var(--text)`
  - Sub: `fontSize: 10, color: var(--muted)`
- Right side: `.pill` badge with type label
  - `fontSize: 9`
  - Text: `"Page"` | `"Position"` | `"Coin"`

---

## 4. CoinAutocomplete Component

**File:** `src/components/CoinAutocomplete.tsx` (81 lines)

### 4.1 Props

```typescript
interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;  // default: "BTC"
}
```

### 4.2 State

| State var | Type | Default |
|-----------|------|---------|
| `open` | `boolean` | `false` |
| `selected` | `number` | `0` |

### 4.3 Data Source

```typescript
const { coins } = useLivePrices(); // LiveCoin[] from CoinGecko
```

### 4.4 Matching Logic

```typescript
const q = value.toLowerCase().trim();
const matches = q.length > 0
  ? coins.filter(c =>
      c.symbol.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q)
    ).slice(0, 8)
  : [];
```

- Matches on **both** symbol and name
- Case-insensitive `.includes()`
- Max 8 results
- No results if input is empty

### 4.5 Selection Behavior

On select (click or Enter):
```typescript
onChange(matches[selected].symbol.toUpperCase());
setOpen(false);
```
- Sets the value to the uppercase symbol (e.g., "BTC")

### 4.6 Keyboard

- `ArrowDown` / `ArrowUp` — navigate results
- `Enter` — select highlighted (prevents default form submit)
- `Escape` — close dropdown

### 4.7 Click Outside

Same pattern as GlobalSearch — `mousedown` listener on document.

### 4.8 UI Structure

**Input:**
```jsx
<div ref={wrapRef} style={{ position: "relative" }}>
  <input
    className="inp"
    value={value}
    onChange={e => { onChange(e.target.value); setOpen(true); setSelected(0); }}
    onFocus={() => value && setOpen(true)}
    onKeyDown={handleKeyDown}
    placeholder={placeholder}
  />
</div>
```

**Dropdown:**
```css
position: absolute;
top: 100%;
left: 0;
right: 0;
zIndex: 999;
background: var(--panel);
border: 1px solid var(--line);
borderRadius: var(--lt-radius-sm, 8px);
maxHeight: 240px;
overflowY: auto;
boxShadow: 0 8px 30px rgba(0,0,0,.25);
marginTop: 2px;
```

**Result Item:**
```css
padding: 6px 10px;
cursor: pointer;
fontSize: 11px;
background: i === selected ? var(--brand3) : transparent;
borderBottom: 1px solid var(--line2);
display: flex;
justifyContent: space-between;
alignItems: center;
```

**Result item content:**
- Left side (flex, gap 6):
  - Coin image: `<img src={c.image} alt="" style={{ width: 16, height: 16, borderRadius: 8 }} />`
  - Symbol: `fontWeight: 700, color: var(--text)`, uppercase
  - Name: `color: var(--muted), fontSize: 10`
- Right side:
  - Market cap rank: `.mono`, `color: var(--muted), fontSize: 10`, format: `#123`

---

## 5. Price Data Source (`useLivePrices` hook)

**File:** `src/hooks/useLivePrices.ts`

### 5.1 LiveCoin Interface (from CoinGecko)

```typescript
interface LiveCoin {
  id: string;           // CoinGecko ID (e.g., "bitcoin")
  symbol: string;       // e.g., "btc"
  name: string;         // e.g., "Bitcoin"
  current_price: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number;
  image: string;        // URL to coin icon
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}
```

### 5.2 CoinGecko Polling

- **Endpoint:** `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page={1,2}&sparkline=false&price_change_percentage=1h,24h,7d`
- **Pages fetched:** 2 (up to 500 coins total)
- **Poll interval:** 180s (`CG_POLL_MS`)
- **Stale threshold:** 170s (`CG_STALE_MS`)
- **Rate limit handling:** On 429, exponential backoff: `min(600_000, 2^fails * 60_000)` ms
- **Singleton pattern:** Global cache shared across all hook instances
- **Page 2 delay:** 5s after page 1 fetch

### 5.3 Hook Return Value

```typescript
{
  coins: LiveCoin[];                    // CoinGecko market data (for search/autocomplete)
  loading: boolean;                     // True until first CG fetch
  getPrice: (sym: string) => LiveCoin | null;  // Merged price getter
  priceMap: Map<string, LiveCoin>;      // CG data by symbol
  spotPrices: Record<string, SpotPrice>; // Binance + WS merged
}
```

Both `GlobalSearch` and `CoinAutocomplete` use the `coins` array.

---

## 6. CSS Classes & Variables Reference

| Token | Usage |
|-------|-------|
| `.searchBox` | Global search wrapper (in Topbar) |
| `.topbar` | Header bar |
| `.topRight` | Right-aligned section of topbar |
| `.pageTitle` | Page title text |
| `.pageSub` | Page subtitle text |
| `.inp` | Form input styling |
| `.pill` | Small badge/tag |
| `.mono` | Monospace font |
| `var(--panel)` | Dropdown background |
| `var(--line)` | Border color |
| `var(--line2)` | Lighter border |
| `var(--text)` | Primary text color |
| `var(--muted)` | Secondary/muted text |
| `var(--brand3)` | Highlight/selected background |
| `var(--lt-radius-sm)` | Small border radius (default 8px) |

---

## 7. Interaction Summary

### GlobalSearch Interactions

| Trigger | Action |
|---------|--------|
| Click search input | Focus, open if has query |
| Type in input | Filter results, open dropdown, reset selection to 0 |
| `⌘K` / `Ctrl+K` | Open and focus search |
| `Escape` | Close dropdown |
| `↑` / `↓` | Navigate results |
| `Enter` | Navigate to selected result |
| Click result | Navigate to result |
| Click outside | Close dropdown |
| Select "page" result | Navigate to that page |
| Select "position" result | Navigate to Assets page |
| Select "coin" result | Navigate to Markets page |

### CoinAutocomplete Interactions

| Trigger | Action |
|---------|--------|
| Type in input | Show matching coins, reset selection |
| Focus input (with value) | Reopen dropdown |
| `↑` / `↓` | Navigate matches |
| `Enter` | Set value to selected symbol (uppercase) |
| `Escape` | Close dropdown |
| Click match | Set value to coin symbol |
| Click outside | Close dropdown |

---

## 8. Edge Cases & Limits

1. **Empty query:** GlobalSearch returns no results. CoinAutocomplete returns no matches.
2. **CoinGecko rate limit (429):** Exponential backoff up to 10 minutes. Search uses cached data.
3. **No coins loaded yet:** `loading: true`, empty `coins` array → no autocomplete results
4. **Position dedup in GlobalSearch:** If user holds BTC and CoinGecko also has BTC, only the "position" result shows (coin result skipped)
5. **Max results:** GlobalSearch: 12 total. CoinAutocomplete: 8 matches.
6. **Keyboard selection bounds:** Clamped to `[0, results.length - 1]`
7. **Missing pages in search:** Alerts and Vault are not indexed in GlobalSearch's `PAGES` array
8. **CoinGecko image fallback:** CoinAutocomplete renders `<img src={c.image}>` — no fallback if image URL is empty
9. **Symbol casing:** All symbols normalized to uppercase for display and matching
