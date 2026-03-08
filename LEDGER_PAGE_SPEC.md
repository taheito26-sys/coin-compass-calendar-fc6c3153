# Ledger Page — Complete Technical Specification

> Standalone build spec. Every data structure, UI element, interaction, API call, and edge case is documented verbatim from the source code.

---

## 1. Page Architecture

**File:** `src/pages/LedgerPage.tsx` (637 lines)  
**Layout:** Three vertically stacked sections:
1. **Top row** — side-by-side grid: Manual Entry panel + CSV Import panel
2. **Sync status banner** — conditional error banner
3. **Transaction Ledger** — full-width sortable table

**CSS class:** `.ledger-top-grid` for the 2-column top layout.

---

## 2. Dependencies & Imports

```typescript
import { useState, useRef, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { uid, fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { importCSV, hashFile } from "@/lib/importers";
import type { ParseResult } from "@/lib/importers";
import CoinAutocomplete from "@/components/CoinAutocomplete";
import {
  createTransaction, updateTransaction, deleteTransaction,
  batchCreateTransactions, createImportedFile, fetchImportedFiles,
  isWorkerConfigured,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetId, resolveAssetSymbol } from "@/lib/assetResolver";
```

---

## 3. Constants

```typescript
const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance", bybit: "Bybit", okx: "OKX", gate: "Gate.io",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX32_RE = /^[0-9a-f]{32}$/i;

function isBackendId(id: string): boolean {
  return UUID_RE.test(id) || HEX32_RE.test(id);
}
```

---

## 4. State Management

### 4.1 Manual Entry State

| State var | Type | Default | Purpose |
|-----------|------|---------|---------|
| `type` | `string` | `"buy"` | Transaction type |
| `asset` | `string` | `""` | Asset symbol (autocomplete) |
| `qty` | `string` | `""` | Quantity input |
| `price` | `string` | `""` | Unit price input |
| `fee` | `string` | `"0"` | Fee amount |
| `venue` | `string` | `""` | Exchange/venue name |
| `note` | `string` | `""` | Tags/note |
| `saving` | `boolean` | `false` | Submission loading state |

### 4.2 Import State

| State var | Type | Default | Purpose |
|-----------|------|---------|---------|
| `importStage` | `"upload" \| "preview" \| "committing" \| "done" \| "error"` | `"upload"` | Import workflow stage |
| `importResult` | `ParseResult \| null` | `null` | Parsed CSV data |
| `importCounts` | `ImportCounts \| null` | `null` | Final commit statistics |
| `importErrorMsg` | `string` | `""` | Error message for import failures |
| `fileName` | `string` | `""` | Uploaded file name |
| `fileHash` | `string` | `""` | SHA-256 hash for dedup |
| `importLoading` | `boolean` | `false` | File parsing loading |
| `importError` | `string` | `""` | Parse-stage error message |
| `fileRef` | `RefObject<HTMLInputElement>` | — | Hidden file input ref |

### 4.3 Edit State

| State var | Type | Default | Purpose |
|-----------|------|---------|---------|
| `editId` | `string \| null` | `null` | Currently editing transaction ID |
| `editAsset` | `string` | `""` | Editing asset value |
| `editQty` | `string` | `""` | Editing quantity value |
| `editPrice` | `string` | `""` | Editing price value |
| `editType` | `string` | `""` | Editing type value |

### 4.4 ImportCounts Interface

```typescript
interface ImportCounts {
  parsed: number;      // Total rows parsed from CSV
  accepted: number;    // Rows that passed asset resolution
  rejected: number;    // Rows with missing asset mappings
  persisted: number;   // Successfully saved to backend
  skippedDuplicate: number; // Skipped by external_id dedup
  failed: number;      // Backend persistence failures
}
```

---

## 5. Manual Entry Panel

### 5.1 UI Layout

- **Panel class:** `.panel` with `.panel-head` containing `<h2>+ Manual Entry</h2>` and conditional `<span className="pill">Syncing…</span>`
- **Body:** `.panel-body` with CSS grid `gridTemplateColumns: "1fr 1fr"`, gap 8px
- **Form fields:** Each wrapped in `.form-field` with `.form-label`

### 5.2 Form Fields

| Field | Element | Details |
|-------|---------|---------|
| Type | `<select className="inp">` | Options: Buy, Sell, Transfer In, Transfer Out, Reward |
| Asset | `<CoinAutocomplete>` | Autocomplete component (see §11) |
| Quantity | `<input type="number">` | `.inp` class |
| Unit Price | `<input type="number">` | Shows `({state.base})` label |
| Venue | `<input>` | Placeholder: "Binance, Coinbase..." |
| Tags | `<input>` | Placeholder: "Optional" |
| Save button | `<button className="btn">` | Spans full width via `gridColumn: "1/-1"` |

### 5.3 Transaction Types

```
"buy" | "sell" | "transfer_in" | "transfer_out" | "reward"
```

### 5.4 Save Flow (`save()`)

1. **Normalize asset:** `resolveAssetSymbol(asset)` → canonical symbol
2. **Validate:** Asset must be non-empty, qty must be > 0
3. **Set `saving = true`**
4. **If Worker configured (`isWorkerConfigured()`):**
   - Fetch asset catalog: `getAssetCatalog()`
   - Resolve asset ID: `resolveAssetId(normalizedAsset, assets)`
   - If no asset ID → toast error and return
   - Call `createTransaction({ asset_id, timestamp: new Date(ts).toISOString(), type, qty, unit_price, fee_amount, fee_currency: state.base, venue, note, source: "manual" })`
   - Call `rehydrateFromBackend()` to refresh canonical state
   - Toast: "Transaction saved ✓" (good)
5. **If Worker NOT configured (local fallback):**
   - Generate local ID: `local_${uid()}`
   - Prepend to `state.txs` array
   - Toast: "Saved locally only (Worker API not configured)" (bad)
6. **Reset all form fields**
7. **Error handling:** catch → toast error message
8. **Finally:** `saving = false`

---

## 6. CSV Import Panel

### 6.1 UI Structure

- **Panel head:** `📥 CSV Import` with `<span className="pill">Spot Trades</span>`
- **Exchange badges:** Row of pills for each supported exchange: Binance, Bybit, OKX, Gate.io

### 6.2 Stage: Upload

- **Drop zone:** `.import-drop` div, minHeight 100px
  - `onDragOver`: `e.preventDefault()`
  - `onDrop`: Extract first file, call `handleFile(file)`
  - `onClick`: Trigger hidden `<input ref={fileRef} type="file" accept=".csv,.txt">`
- **Icon:** SVG upload arrow (24x24 viewBox, path draws arrow-up-to-tray)
- **Text:** "Drop CSV or click to browse" (fontSize 12)
- **Loading:** Shows "Parsing…" in `.muted` div
- **Error:** Shows `importError` in `.import-error` div

### 6.3 File Processing (`handleFile`)

1. Read file as text: `file.text()`
2. Compute SHA-256 hash: `hashFile(text)`
3. **Local dedup check:** Compare hash against `state.importedFiles[].hash`
4. **Backend dedup check (if Worker configured):** `fetchImportedFiles()` → compare `file_hash`
5. Parse CSV: `importCSV(text, file.name)` → `ParseResult`
6. If 0 rows + warnings → show first warning as error
7. Otherwise → set stage to `"preview"`

### 6.4 Stage: Preview

- **Summary stats:** `.import-summary` with `.import-stat` children:
  - Parsed count (`.good` color)
  - Skipped count (`.bad` color if > 0, else `.muted`)
- **Warnings:** `.import-warnings` → each warning as `.import-warning` with ⚠ prefix
- **Buttons:**
  - Cancel (`.btn.secondary`) → `resetImport()`
  - Commit (`.btn`) → `commitImport()` — label: "Commit {rowCount} Trades"

### 6.5 Stage: Committing

- Centered text: "Persisting to backend…"
- Subtitle: "Do not close this page." (muted, fontSize 12)

### 6.6 Commit Flow (`commitImport`)

**BACKEND-FIRST pipeline:**

1. **Gate check:** If `!isWorkerConfigured()` → toast error, return
2. **Set stage to `"committing"`**
3. **Fetch asset catalog:** `getAssetCatalog()`
4. **Build batch payload:**
   - For each `importResult.row`:
     - Resolve asset: `resolveAssetId(row.symbol, assets)`
     - If no asset ID → add to `missingSymbols` Set, increment `counts.rejected`
     - Generate deterministic `external_id`:
       - If `row.externalId` exists: `"{exchange}:{externalId}"`
       - Else: `"{exchange}:{timestamp}:{symbol}:{side}:{qty}:{unitPrice}"`
     - Build payload object with: `asset_id, timestamp (ISO), type, qty, unit_price, fee_amount, fee_currency, venue, note ("Import: {externalId}"), source: "csv-import", external_id`
5. **Batch persistence:** Send in chunks of 500 via `batchCreateTransactions(batch)`
   - Accumulate `counts.persisted`, `counts.skippedDuplicate`, `counts.failed`
6. **Record imported file:** `createImportedFile({ file_name, file_hash, exchange, export_type, row_count: counts.persisted })`
   - 409 responses are silently ignored (already recorded)
7. **Refresh UI:** `rehydrateFromBackend()`
8. **Set counts and stage:**
   - If failures > 0 and some persisted → stage `"done"` with error message
   - If all failed → stage `"error"`
   - Otherwise → stage `"done"`
9. **Toast:** Shows persisted count, skipped duplicates, rejected count

### 6.7 Stage: Done

- **Full stats grid:** Parsed, Accepted, Persisted (`.good`), Duplicates (if > 0), Rejected (`.bad` if > 0), Failed (`.bad` if > 0)
- **Error message** if present
- **Button:** "Import Another" → `resetImport()`

### 6.8 Stage: Error

- **Error block:** `.import-error` with bold "Import failed" + error message
- **Stats grid** (if counts available)
- **Buttons:** Cancel + Retry Import

### 6.9 Reset Import (`resetImport`)

Resets all import state to defaults:
```typescript
setImportStage("upload"); setImportResult(null); setImportCounts(null);
setImportErrorMsg(""); setFileName(""); setFileHash(""); setImportError("");
if (fileRef.current) fileRef.current.value = "";
```

---

## 7. Sync Status Banner

Shown conditionally when `state.syncStatus === "error"`:

```jsx
<div className="panel" style={{ borderColor: "var(--bad)", marginBottom: 12 }}>
  <div className="panel-body" style={{ color: "var(--bad)", fontSize: 13 }}>
    ⚠ Backend sync error: {state.syncError || "Unknown"}. Data shown may be stale.
    <button className="btn secondary" onClick={rehydrateFromBackend}>Retry</button>
  </div>
</div>
```

---

## 8. Transaction Ledger Table

### 8.1 Header

- Panel head: `Transaction Ledger` with pill showing `{txs.length} entries`

### 8.2 Data Source

```typescript
const txs = state.txs.slice().sort((a, b) => b.ts - a.ts).slice(0, 200);
```
- Sorted by timestamp descending
- Capped at 200 rows

### 8.3 Table Columns

| Column | Header | Content | Styling |
|--------|--------|---------|---------|
| DATE | `DATE` | `new Date(t.ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })` | `.mono` |
| TYPE | `TYPE` | `t.type.toUpperCase()` | `.mono`, `.good` for buy, `.bad` for sell, fontWeight 900 |
| ASSET | `ASSET` | `t.asset` | `.mono`, fontWeight 900 |
| QTY | `QTY` | `fmtQty(t.qty)` | `.mono` |
| UNIT PRICE | `UNIT PRICE` | `fmtPx(t.price)` for buy/sell, "—" otherwise | `.mono` |
| FEE | `FEE` | `fmtFiat(t.fee, state.base)` if > 0, "—" otherwise | `.mono .muted` |
| VENUE | `VENUE` | `t.venue || "—"` | `.mono .muted` |
| TAGS | `TAGS` | `t.note || "—"` | `.mono .muted`, maxWidth 100, overflow ellipsis |
| ACTIONS | `ACTIONS` | Edit ✎ and Delete 🗑 buttons | flex, gap 4 |

### 8.4 Empty State

```jsx
<tr><td colSpan={9} className="muted">No transactions yet. Use Manual Entry or CSV Import above.</td></tr>
```

### 8.5 Action Buttons (View Mode)

- **Edit ✎:** `onClick={() => startEdit(t)}` — border: `var(--line)`, color: `var(--text)`, fontSize 13
- **Delete 🗑:** `onClick={() => deleteTx(t.id)}` — border: `var(--line)`, color: `var(--bad)`, fontSize 13

Both use inline styles:
```
background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer"
```

---

## 9. Inline Editing

### 9.1 Start Edit (`startEdit`)

```typescript
const startEdit = (t: any) => {
  setEditId(t.id);
  setEditAsset(t.asset);
  setEditQty(String(t.qty));
  setEditPrice(String(t.price));
  setEditType(t.type);
};
```

### 9.2 Edit Row Rendering

When `editId === t.id`, the row renders:
- **Date:** Read-only (same format as view mode)
- **Type:** `<select>` with BUY/SELL options (width 80px, fontSize 11)
- **Asset:** `<input>` (width 60px, fontSize 11)
- **Qty:** `<input type="number">` (width 90px, fontSize 11)
- **Price:** `<input type="number">` (width 80px, fontSize 11)
- **Fee/Venue/Tags:** All show "—" (read-only during edit)
- **Actions:** ✓ (save, color `var(--good)`) and ✕ (cancel, color `var(--muted)`)

### 9.3 Save Edit (`saveEdit`)

1. Find existing transaction by `editId`
2. Normalize asset via `resolveAssetSymbol()`
3. Parse qty/price with fallback to existing values
4. **If Worker + backend ID:**
   - Resolve asset ID via catalog
   - Call `updateTransaction(editId, { asset_id, type, qty, unit_price })`
   - Call `rehydrateFromBackend()`
   - Toast: "Transaction updated ✓"
5. **If local:**
   - Update in `state.txs` array via `setState`
   - Toast: "Updated local-only transaction (not synced)" (bad)
6. Reset `editId = null`

### 9.4 Delete Transaction (`deleteTx`)

1. **If Worker + backend ID:**
   - Call `deleteTransaction(id)`
   - Call `rehydrateFromBackend()`
   - Toast: "Transaction deleted ✓"
2. **If local:**
   - Filter out of `state.txs`
   - Toast: "Deleted local-only transaction"

---

## 10. CSV Import System (Full Pipeline)

### 10.1 File Structure

```
src/lib/importers/
├── index.ts      — Orchestrator
├── types.ts      — Type definitions
├── csv.ts        — CSV parser + hash utility
├── detector.ts   — Exchange detection
├── binance.ts    — Binance adapter
├── bybit.ts      — Bybit adapter
├── okx.ts        — OKX adapter
└── gate.ts       — Gate.io adapter
```

### 10.2 Type Definitions (`types.ts`)

```typescript
export type Exchange = "binance" | "bybit" | "okx" | "gate";

export interface NormalizedRow {
  timestamp: number;        // unix ms
  exchange: Exchange;
  symbol: string;           // e.g. "BTCUSDT" (raw pair)
  side: "buy" | "sell";
  qty: number;
  unitPrice: number;
  grossValue: number;       // qty * unitPrice
  feeAmount: number;
  feeAsset: string;
  externalId: string;       // trade ID from exchange
  note: string;
  raw: Record<string, string>; // original CSV row
}

export interface ParseResult {
  exchange: Exchange;
  exportType: string;       // e.g. "Spot Trade History"
  rows: NormalizedRow[];
  skipped: SkippedRow[];
  warnings: string[];
  dateRange: [number, number] | null; // [earliest, latest] unix ms
  rowCount: number;
  skippedCount: number;
}

export interface SkippedRow {
  line: number;
  reason: string;
  raw: Record<string, string>;
}

export interface DetectionResult {
  detected: boolean;
  exchange: Exchange | null;
  exportType: string | null;
  rejected: boolean;
  rejectionReason: string | null;
}

export interface ImportFile {
  name: string;
  hash: string;
  importedAt: number;
  exchange: Exchange;
  exportType: string;
  rowCount: number;
}
```

### 10.3 CSV Parser (`csv.ts`)

**`parseCSV(text: string)`:**
- Splits on `\r?\n`, filters empty lines
- Handles quoted fields (double-quote escaping: `""` → `"`)
- Strips BOM (`\uFEFF`) from header line
- Returns `{ headers: string[], rows: Record<string, string>[] }`
- Skips rows with < 2 values

**`hashFile(content: string)`:**
- Uses `crypto.subtle.digest("SHA-256", data)`
- Returns lowercase hex string (64 chars)

### 10.4 Exchange Detection (`detector.ts`)

**Header signatures (matched in order):**

| Exchange | Export Type | Required Headers |
|----------|-----------|-----------------|
| Binance | Spot Trade History | `Date(UTC)`, `Pair`, `Side`, `Price` |
| Binance (alt) | Spot Trade History | `Date(UTC)`, `Market`, `Type`, `Price`, `Amount`, `Total`, `Fee`, `Fee Coin` |
| Bybit | Spot Trade History | `Symbol`, `Side`, `TradeTime` |
| Bybit (alt) | Spot Trade History | `Symbol`, `Side`, `Trading Time` |
| OKX | Trading History | `Instrument ID` |
| OKX (alt) | Trading History | `instrument_id` |
| Gate.io | Spot Trade History | `pair` |
| Gate.io (alt) | Spot Trade History | `Pair`, `Side` |

**Rejection patterns (regex on joined header string):**

| Pattern | Rejection Reason |
|---------|-----------------|
| `/futures\|perpetual\|perp\|swap/i` | Futures/Perpetual not supported |
| `/margin/i` | Margin not supported |
| `/option/i` | Options not supported |
| `/earn\|staking\|savings/i` | Earn/Staking not supported |
| `/p2p/i` | P2P not supported |
| `/copy.?trad/i` | Copy trading not supported |
| `/deposit\|withdrawal\|withdraw/i` | Only spot trade history accepted |
| `/funding/i` | Funding not supported |
| `/billing/i` | Billing not supported |

**Row-level rejection:** First 5 rows checked for `SWAP|FUTURES|OPTION|MARGIN` in values. OKX `Instrument Type` column specifically checked.

### 10.5 Binance Parser (`binance.ts`)

**Header variants:**
- Primary: `Date(UTC)`, `Pair`, `Side`, `Price`, `Executed`, `Amount`, `Fee`, `Fee Coin`
- Alternate: `Date(UTC)`, `Market`, `Type`, `Price`, `Amount`, `Total`, `Fee`, `Fee Coin`

**Field mapping:**
| Field | Primary Key | Fallback Keys |
|-------|------------|---------------|
| Date | `Date(UTC)` | `Date` |
| Symbol | `Pair` | `Market` |
| Side | `Side` | `Type` |
| Qty | `Executed` | `Amount`, `Qty` |
| Price | `Price` | — |
| Total | `Amount` | `Total` |
| Fee | `Fee` | — |
| Fee Asset | `Fee Coin` | `Fee Asset` |
| Trade ID | `Trade ID` | `TradeId` |

**Validation:** Skips if: invalid timestamp, missing symbol, invalid side (not BUY/SELL), qty ≤ 0, price < 0.  
**Symbol processing:** Removes `_-/\s`, uppercases.  
**grossValue:** `price > 0 ? qty * price : Math.abs(total)`

### 10.6 Bybit Parser (`bybit.ts`)

**Header variants:**
- Primary: `Symbol`, `TradeTime`, `Side`, `TradePrice`, `ExecQty`, `ExecFee`, `FeeAsset`
- Alternate: `Symbol`, `Trading Time`, `Side`, `Avg. Filled Price`, `Filled`, `Fee`, `Fee Asset`

**Non-spot filter:** Checks `Category` / `Type` column — rejects if not `SPOT` or empty.

**Field mapping:**
| Field | Primary Key | Fallback Keys |
|-------|------------|---------------|
| Date | `TradeTime` | `Trading Time`, `Trade Time`, `Create Time` |
| Symbol | `Symbol` | `Contracts` |
| Price | `TradePrice` | `Avg. Filled Price`, `Avg Filled Price`, `Order Price` |
| Qty | `ExecQty` | `Filled`, `Qty` |
| Fee | `ExecFee` | `Fee`, `Trading Fee` |
| Fee Asset | `FeeAsset` | `Fee Asset`, `Fee Currency` |
| Trade ID | `TradeId` | `Trade ID`, `OrderId`, `Order ID` |

### 10.7 OKX Parser (`okx.ts`)

**Header variants:** Mixed casing — uses multi-key getter function.

**Instrument type filter:** Rejects if `instType` not SPOT.

**Timestamp handling:** Supports unix ms (>1e12), unix sec (>1e9), or date string.

**Field mapping (multi-key getter):**
| Field | Keys checked |
|-------|-------------|
| Instrument | `Instrument ID`, `instrument_id`, `instId` |
| Time | `Fill time`, `fill_time`, `Trade time`, `trade_time`, `Filled Time` |
| Side | `Side`, `side` |
| Price | `Fill price`, `fill_price`, `Price`, `price` |
| Qty | `Fill size`, `fill_size`, `Size`, `size`, `Filled Qty` |
| Fee | `Fee`, `fee` |
| Fee Asset | `Fee currency`, `fee_currency`, `Fee Currency` |
| Trade ID | `Trade ID`, `trade_id`, `TradeId` |

**Note:** OKX fees are often negative — uses `Math.abs(fee)`.

### 10.8 Gate.io Parser (`gate.ts`)

**Header variants:** Uses multi-key getter function.

**Timestamp handling:** Same as OKX (unix ms/sec/date string).

**Field mapping:**
| Field | Keys checked |
|-------|-------------|
| Pair | `Pair`, `pair`, `Currency Pair`, `currency_pair`, `Market` |
| Time | `Time`, `time`, `Create Time`, `create_time`, `Trade Time`, `trade_time` |
| Side | `Side`, `side`, `Type`, `type` |
| Price | `Order Price`, `order_price`, `Price`, `price` |
| Qty | `Amount`, `amount`, `Quantity`, `quantity`, `Filled` |
| Total | `Total`, `total` |
| Fee | `Fee`, `fee`, `Trading Fee` |
| Fee Asset | `Fee Coin`, `fee_coin`, `Fee Currency`, `fee_currency` |
| Trade ID | `Trade ID`, `trade_id`, `TradeId`, `No`, `no` |

### 10.9 Import Orchestrator (`index.ts`)

**`importCSV(fileContent, fileName)` flow:**

1. Parse CSV → `{ headers, rows }`
2. If empty → return empty result with warning
3. Detect exchange via `detectExchange(headers, firstRows)`
4. If rejected → return with rejection reason
5. Parse with exchange adapter: `ADAPTERS[exchange](rows)`
6. **Normalize symbols:** `normalizeSymbol(row.symbol)` for each row
7. **Deduplicate:** By `externalId` or composite fingerprint `{exchange}:{timestamp}:{symbol}:{side}:{qty}:{unitPrice}`
8. Compute date range `[min, max]`
9. Return `ParseResult`

---

## 11. Symbol Normalization (`symbolAliases.ts`)

### 11.1 Alias Map

```typescript
const SYMBOL_ALIASES: Record<string, string> = {
  XBT: "BTC", BCHABC: "BCH", BCHSV: "BSV", MIOTA: "IOTA",
  YOYO: "YOYOW", BKRW: "KRW", IOST: "IOST", LUNA2: "LUNA",
  LUNC: "LUNC", CGLD: "CELO", REP: "REP", REPV2: "REP",
  SUSHI: "SUSHI", RNDR: "RENDER", WBTC: "WBTC", STETH: "STETH",
};
```

### 11.2 Quote Currencies (stripped from pairs)

```typescript
const QUOTE_CURRENCIES = [
  "USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "UST",
  "BTC", "ETH", "BNB", "EUR", "GBP", "TRY", "BRL", "ARS",
];
```

### 11.3 Functions

**`normalizeSymbol(raw)`:**
1. Trim + uppercase
2. Remove leading digits (e.g., "1000PEPE" → "PEPE")
3. Apply alias map

**`extractBaseFromPair(pair)`:**
1. Remove `-PERP`, `-SWAP`, `-SPOT`, `-MARGIN` suffixes
2. Split on `/` → take first part
3. Split on `-` → take first part
4. Strip known quote currencies from end
5. Apply `normalizeSymbol()`

**`matchAssetBySymbol(sym, assets)`:**
- Normalize symbol, then match against asset list checking both `symbol` and `binance_symbol` fields
- Returns asset `id` or `null`

---

## 12. Asset Resolver (`assetResolver.ts`)

### 12.1 Asset Catalog Cache

```typescript
const ASSET_CACHE_MS = 60_000; // 1 minute TTL
let assetCache: ApiAsset[] = [];
let assetCacheTs = 0;
```

### 12.2 Functions

**`getAssetCatalog(force?)`:** Fetches from `/api/assets`, caches for 60s.

**`resolveAssetSymbol(rawSymbol)`:**
- If contains `/_-` → extract base from pair
- Otherwise → normalize directly

**`resolveAssetId(rawSymbol, assets)`:**
- Resolve symbol, then match against asset catalog
- Returns `{ assetId: string | null, symbol: string }`

---

## 13. API Layer (`api.ts`)

### 13.1 Configuration

```typescript
const DEFAULT_WORKER_BASE = "https://cryptotracker-api.taheito26.workers.dev";
const WORKER_BASE = resolveWorkerBase(import.meta.env.VITE_WORKER_API_URL);
```

**`resolveWorkerBase(raw)`:** Validates URL has http/https protocol, falls back to default.

**`isWorkerConfigured()`:** Returns `Boolean(WORKER_BASE)`.

### 13.2 Auth Token Resolution

Priority order:
1. `tokenProvider` (set by `setAuthTokenProvider()` from Clerk)
2. `window.Clerk.session.getToken()` (fallback)

### 13.3 `apiFetch<T>(path, options)`

- Requires `isWorkerConfigured()`
- Injects `Authorization: Bearer {token}` header
- Default timeout: 15s via `AbortSignal.timeout(15000)`
- Error wrapping: Network errors include Worker URL and CORS hint

### 13.4 Transaction API

| Function | Method | Path | Notes |
|----------|--------|------|-------|
| `fetchTransactions()` | GET | `/api/transactions` | Returns `{ transactions: ApiTransaction[] }` |
| `createTransaction(input)` | POST | `/api/transactions` | Single create |
| `updateTransaction(id, updates)` | PUT | `/api/transactions/{id}` | Partial update |
| `deleteTransaction(id)` | DELETE | `/api/transactions/{id}` | — |
| `batchCreateTransactions(txs)` | POST | `/api/transactions/batch` | 60s timeout, returns `BatchCreateResult` |

### 13.5 BatchCreateResult

```typescript
interface BatchCreateResult {
  created: number;
  skippedDuplicates: number;
  errors: number;
  errorDetails: Array<{ index: number; reason: string }>;
  transactions: ApiTransaction[];
}
```

### 13.6 Imported Files API

| Function | Method | Path |
|----------|--------|------|
| `fetchImportedFiles()` | GET | `/api/imported-files` |
| `createImportedFile(input)` | POST | `/api/imported-files` |

---

## 14. Formatting Utilities

From `cryptoState.ts`:

```typescript
function fmtFiat(n: number, _cur?: string): string  // e.g. "$1,234.56"
function fmtQty(n: number): string                   // e.g. "0.00123456" or "1,234"
function fmtPx(n: number): string                    // e.g. "$98,765.43"
```

---

## 15. CSS Classes & Variables Reference

| Class/Variable | Usage |
|---------------|-------|
| `.panel` | Card container |
| `.panel-head` | Card header with title |
| `.panel-body` | Card body content |
| `.pill` | Small badge/tag |
| `.btn` | Primary button |
| `.btn.secondary` | Secondary button |
| `.inp` | Form input |
| `.form-field` | Form field wrapper |
| `.form-label` | Field label |
| `.mono` | Monospace font |
| `.muted` | Muted text color |
| `.good` | Positive/green color |
| `.bad` | Negative/red color |
| `.tableWrap` | Scrollable table container |
| `.import-drop` | Drag-and-drop upload zone |
| `.import-error` | Error message styling |
| `.import-summary` | Stats row container |
| `.import-stat` | Individual stat block |
| `.import-stat-val` | Stat value |
| `.import-stat-lbl` | Stat label |
| `.import-warnings` | Warnings container |
| `.import-warning` | Individual warning |
| `.import-exchanges` | Exchange pills row |
| `.ledger-top-grid` | 2-column top layout |
| `var(--line)` | Border color |
| `var(--line2)` | Lighter border |
| `var(--text)` | Primary text |
| `var(--muted)` | Muted text |
| `var(--good)` | Success green |
| `var(--bad)` | Error red |
| `var(--panel)` | Panel background |
| `var(--lt-radius-sm)` | Small border radius |

---

## 16. Edge Cases & Business Rules

1. **Duplicate file detection:** Both local hash check AND backend hash check before parsing
2. **Idempotent imports:** `external_id` ensures re-importing same file won't create duplicates
3. **Batch size limit:** 500 transactions per batch API call
4. **200 row cap:** Ledger table shows max 200 most recent transactions
5. **Backend vs local IDs:** `isBackendId()` distinguishes UUID/hex32 backend IDs from `local_*` prefixed IDs
6. **Asset resolution failure:** Missing assets are tracked and reported, not silently dropped
7. **Edit limitations:** Only type, asset, qty, price are editable inline. Fee, venue, tags are read-only during edit
8. **Local fallback:** When Worker is not configured, transactions are stored in local state only (not persisted)
9. **Rehydration after mutations:** Every backend write (create/update/delete/import) triggers `rehydrateFromBackend()` to ensure UI matches canonical state
