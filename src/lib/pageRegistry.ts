/**
 * Canonical page registry — single source of truth for all pages.
 * Consumed by: App shell, Sidebar, Topbar, GlobalSearch, CommandPalette.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface PageDef {
  id: string;
  label: string;
  sub: string;
  /** SVG path data for sidebar icon */
  icon: string;
  /** Emoji for command palette */
  emoji: string;
  /** Lazy-loaded page component */
  component: LazyExoticComponent<ComponentType<any>>;
}

const registry: PageDef[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    sub: "KPIs, Allocation, Heatmap",
    icon: "M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-11h7V4h-7v5Z",
    emoji: "📊",
    component: lazy(() => import("@/pages/DashboardPage")),
  },
  {
    id: "assets",
    label: "Portfolio",
    sub: "Holdings, Lots, Alerts",
    icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
    emoji: "💼",
    component: lazy(() => import("@/pages/PortfolioPage")),
  },
  {
    id: "merchant",
    label: "Merchant",
    sub: "Deals, Collaboration, Approvals",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    emoji: "🤝",
    component: lazy(() => import("@/pages/MerchantPage")),
  },
  {
    id: "markets",
    label: "Markets",
    sub: "Live Prices, Watchlist",
    icon: "M22 12h-4l-3 9L9 3l-3 9H2",
    emoji: "🌐",
    component: lazy(() => import("@/pages/MarketsPage")),
  },
  {
    id: "ledger",
    label: "Ledger",
    sub: "Transactions, Import, Connect",
    icon: "M4 4h16v16H4zM4 9h16M9 4v16",
    emoji: "📒",
    component: lazy(() => import("@/pages/LedgerPage")),
  },
  {
    id: "calendar",
    label: "Calendar",
    sub: "Daily P&L, Per Coin",
    icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
    emoji: "📅",
    component: lazy(() => import("@/pages/CalendarPage")),
  },
  {
    id: "settings",
    label: "Settings",
    sub: "Theme, Data, Vault, Alerts",
    icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L13 3h-4l-.9 2.9a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L4 13a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h4l.9-2.9a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6Z",
    emoji: "⚙️",
    component: lazy(() => import("@/pages/SettingsPage")),
  },
];

/** All registered pages */
export const PAGES: readonly PageDef[] = registry;

/** Page lookup by id */
export const PAGE_MAP: ReadonlyMap<string, PageDef> = new Map(registry.map((p) => [p.id, p]));

/** Default page id */
export const DEFAULT_PAGE = "dashboard";

/** Get page title tuple [title, subtitle] */
export function getPageTitle(id: string): [string, string] {
  const page = PAGE_MAP.get(id);
  if (!page) return ["CryptoTracker", ""];
  return [page.label, page.sub];
}

/** Validate a page id — returns the id if valid, or DEFAULT_PAGE */
export function validatePageId(id: string): string {
  return PAGE_MAP.has(id) ? id : DEFAULT_PAGE;
}
