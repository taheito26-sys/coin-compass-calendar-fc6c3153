// Crypto state management - localStorage + helpers
const SK = "crypto_tracker_v1";

export interface CryptoTx {
  id: string; ts: number; type: string; asset: string; qty: number;
  price: number; total: number; fee: number; feeAsset: string;
  accountId: string; note: string; lots?: string;
  realized?: number; cost?: number;
}

export interface CryptoLot {
  id: string; ts: number; asset: string; qty: number; qtyRem: number;
  unitCost: number; cost: number; accountId: string; tag: string; note: string;
}

export interface CryptoAlert {
  id: string; type: string; sym: string; threshold: number;
  active: boolean; createdAt: number; triggeredAt: number | null;
}

export interface CryptoConnection {
  id: string; type: string; name: string; details?: string;
  status: string; createdAt: number;
}

export interface UserHolding {
  id: string; asset: string; buyPrice: number; quantity: number;
  date: number; exchange?: string; note?: string;
}

export interface CalendarEntry {
  date: string; // YYYY-MM-DD
  pnl: number;
  trades: number;
  perCoin: Record<string, number>;
}

export interface ImportedFile {
  name: string;
  hash: string;
  importedAt: number;
  exchange: string;
  exportType: string;
  rowCount: number;
}

export interface CryptoState {
  base: string;
  method: string;
  txs: CryptoTx[];
  lots: CryptoLot[];
  prices: Record<string, number>;
  pricesTs: number;
  watch: string[];
  alerts: CryptoAlert[];
  connections: CryptoConnection[];
  accounts: { id: string; name: string }[];
  apiUrl: string;
  market?: { trending?: any[]; top?: any[] };
  // User portfolio
  holdings: UserHolding[];
  // Calendar
  calendarEntries: CalendarEntry[];
  // Import
  importedFiles: ImportedFile[];
  // UI
  layout: string;
  theme: string;
}

export const CRYPTO_ID_MAP: Record<string, string> = {
  BTC:"bitcoin", ETH:"ethereum", SOL:"solana", USDT:"tether", USDC:"usd-coin",
  BNB:"binancecoin", XRP:"ripple", ADA:"cardano", DOGE:"dogecoin", TRX:"tron",
  TON:"toncoin", AVAX:"avalanche-2", LINK:"chainlink", DOT:"polkadot",
  MATIC:"matic-network", LTC:"litecoin", BCH:"bitcoin-cash", XLM:"stellar",
  ATOM:"cosmos", APT:"aptos", ARB:"arbitrum", OP:"optimism", SUI:"sui",
  PEPE:"pepe", SHIB:"shiba-inu"
};

const VALID_LAYOUTS = new Set(["flux", "cipher", "vector", "aurora", "carbon", "prism", "noir", "pulse"]);
const VALID_THEMES = new Set(["t1", "t2", "t3", "t4", "t5"]);
const VALID_METHODS = new Set(["FIFO", "DCA"]);
const VALID_BASES = new Set(["USD", "EUR", "GBP", "QAR"]);

export function defaultState(): CryptoState {
  return {
    base: "USD", method: "FIFO",
    txs: [], lots: [], prices: {}, pricesTs: 0,
    watch: ["BTC","ETH","SOL","BNB"], alerts: [], connections: [],
    accounts: [{ id: "acc_main", name: "Main" }],
    apiUrl: "", market: { trending: [], top: [] },
    holdings: [], calendarEntries: [], importedFiles: [],
    layout: "flux", theme: "t1",
  };
}

function sanitizeLoadedState(parsed: any): CryptoState {
  const base = defaultState();
  if (!parsed || typeof parsed !== "object") return base;

  return {
    ...base,
    ...parsed,
    base: VALID_BASES.has(String(parsed.base || "").toUpperCase()) ? String(parsed.base).toUpperCase() : base.base,
    method: VALID_METHODS.has(String(parsed.method || "").toUpperCase()) ? String(parsed.method).toUpperCase() : base.method,
    txs: Array.isArray(parsed.txs) ? parsed.txs : base.txs,
    lots: Array.isArray(parsed.lots) ? parsed.lots : base.lots,
    watch: Array.isArray(parsed.watch) && parsed.watch.length
      ? parsed.watch.filter((v: any) => typeof v === "string" && v.trim())
      : base.watch,
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : base.alerts,
    connections: Array.isArray(parsed.connections) ? parsed.connections : base.connections,
    accounts: Array.isArray(parsed.accounts) && parsed.accounts.length ? parsed.accounts : base.accounts,
    holdings: Array.isArray(parsed.holdings) ? parsed.holdings : base.holdings,
    calendarEntries: Array.isArray(parsed.calendarEntries) ? parsed.calendarEntries : base.calendarEntries,
    importedFiles: Array.isArray(parsed.importedFiles) ? parsed.importedFiles : base.importedFiles,
    prices: parsed.prices && typeof parsed.prices === "object" ? parsed.prices : base.prices,
    pricesTs: Number.isFinite(Number(parsed.pricesTs)) ? Number(parsed.pricesTs) : base.pricesTs,
    layout: VALID_LAYOUTS.has(String(parsed.layout || "")) ? String(parsed.layout) : base.layout,
    theme: VALID_THEMES.has(String(parsed.theme || "")) ? String(parsed.theme) : base.theme,
  };
}

export function loadState(): CryptoState {
  try {
    const raw = localStorage.getItem(SK);
    if (raw) return sanitizeLoadedState(JSON.parse(raw));
  } catch {}
  return defaultState();
}

export function saveState(s: CryptoState) {
  try { localStorage.setItem(SK, JSON.stringify(s)); } catch {}
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function cnum(v: any, d = 0): number {
  const n = Number(String(v || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : d;
}

export function fmtFiat(n: number, cur?: string): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (cur || "USD");
}

export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const dp = Math.abs(n) >= 1 ? 6 : 8;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

export function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const dp = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function cryptoPriceOf(state: CryptoState, sym: string): number | null {
  const p = state.prices[sym.toUpperCase()];
  return Number.isFinite(p) ? p : null;
}

export interface DerivedPosition {
  sym: string; qty: number; cost: number;
  price: number | null; mv: number | null; unreal: number | null;
}

export function cryptoDerived(state: CryptoState) {
  const pos = new Map<string, DerivedPosition>();
  for (const l of state.lots) {
    const sym = l.asset.toUpperCase();
    const q = cnum(l.qtyRem, 0);
    if (!sym || q <= 0) continue;
    const cost = cnum(l.unitCost, 0) * q;
    const p = pos.get(sym) || { sym, qty: 0, cost: 0, price: null, mv: null, unreal: null };
    p.qty += q; p.cost += cost;
    pos.set(sym, p);
  }
  let pricedMV = 0, pricedCost = 0, unpricedCost = 0, totalCost = 0;
  const rows = [...pos.values()].sort((a, b) => b.cost - a.cost);
  for (const r of rows) {
    r.price = cryptoPriceOf(state, r.sym);
    if (r.price !== null) {
      r.mv = r.price * r.qty; r.unreal = r.mv - r.cost;
      pricedMV += r.mv; pricedCost += r.cost;
    } else { unpricedCost += r.cost; }
    totalCost += r.cost;
  }
  const unpriced = rows.filter(r => r.price === null).map(r => r.sym);
  return { base: state.base, rows, pricedMV, pricedCost, unreal: pricedMV - pricedCost, unpricedCost, totalCost, unpriced, priceAgeMs: Date.now() - cnum(state.pricesTs, 0) };
}

// User holdings DCA calculation
export function calcDCA(holdings: UserHolding[], asset: string) {
  const filtered = holdings.filter(h => h.asset.toUpperCase() === asset.toUpperCase());
  const totalQty = filtered.reduce((s, h) => s + h.quantity, 0);
  const totalCost = filtered.reduce((s, h) => s + h.quantity * h.buyPrice, 0);
  const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
  return { totalQty, totalCost, avgPrice, entries: filtered.length };
}

// Refresh prices - no-op now since useLivePrices handles polling.
// Kept for API compatibility. Returns state unchanged.
export async function refreshPrices(state: CryptoState, _force = false): Promise<CryptoState> {
  return { ...state, pricesTs: Date.now() };
}
