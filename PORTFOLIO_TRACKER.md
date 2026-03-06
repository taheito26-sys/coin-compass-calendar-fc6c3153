# Portfolio Tracker - Live Binance Integration

## Overview

The Portfolio Tracker is a comprehensive crypto portfolio management system with live Binance price integration, supporting both FIFO (First-In-First-Out) and DCA (Dollar-Cost Averaging) tracking methods.

## Features

### Live Price Integration
- Automatic price updates from Binance API
- Price staleness detection with warning banner
- Manual refresh capability
- Price cache stored in Supabase for historical tracking

### Flexible Tracking Modes
- **FIFO (First-In-First-Out)**: Track individual lots/batches with precise cost basis
- **DCA (Dollar-Cost Averaging)**: Track weighted average cost across all purchases
- Toggle between modes with a single click
- Per-asset or portfolio-wide tracking preference support

### Transaction Management
- Append-only, audit-grade transaction ledger
- Transaction types supported:
  - Buy
  - Sell
  - Transfer In
  - Transfer Out
  - Reward
  - Fee
  - Adjustment
- Comprehensive transaction history view

### Portfolio Analytics
- Total portfolio value in real-time
- Total cost basis
- Unrealized P&L with percentage gain/loss
- Realized P&L from completed sales
- Position-by-position breakdown
- Asset allocation visualization

### Data Model

#### Assets Table
- Pre-populated with common cryptocurrencies
- Binance symbol mapping for price lookups
- CoinGecko ID for fallback price sources
- Configurable quantity and price precision

#### Transactions Table
- User-scoped with RLS (Row Level Security)
- Timestamp for chronological ordering
- Asset reference with quantity and unit price
- Fee tracking with currency designation
- Venue/exchange tracking
- Notes and tags for categorization

#### Price Cache Table
- Multi-source price storage (Binance, CoinGecko, etc.)
- Timestamp for staleness detection
- Automatic updates via Edge Function

#### Tracking Preferences Table
- Per-asset or global tracking mode selection
- FIFO vs DCA configuration

## Setup Instructions

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Database Setup

The database schema has been created with the following tables:
- `assets` - Cryptocurrency asset definitions
- `transactions` - Transaction ledger
- `tracking_preferences` - User tracking mode preferences
- `price_cache` - Cached prices from various sources

All tables have proper RLS policies enabled for security.

### 3. Edge Function Deployment

The `fetch-prices` Edge Function has been deployed and will fetch live prices from Binance.

To manually trigger a price refresh:
```javascript
await supabase.functions.invoke('fetch-prices', { method: 'POST' });
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Development Server

```bash
npm run dev
```

## Usage

### Adding Transactions

1. Click "Add Transaction" button
2. Select transaction type (Buy, Sell, etc.)
3. Choose asset from dropdown
4. Enter quantity and unit price
5. Optionally add fee amount, venue, and notes
6. Click "Add Transaction"

### Switching Tracking Modes

Use the FIFO/DCA toggle to switch between tracking modes:
- **FIFO Mode**: Shows individual lots with remaining quantities
- **DCA Mode**: Shows weighted average cost across all purchases

### Refreshing Prices

- Prices auto-refresh when you load the page
- Manual refresh: Click "Refresh Prices" button
- Stale price warning appears if prices are >5 minutes old

### Viewing Portfolio

The portfolio view displays:
- Current positions with unrealized P&L
- Market value based on latest Binance prices
- Cost basis and average cost per asset
- Realized P&L from completed transactions

## Calculation Methods

### FIFO (First-In-First-Out)

When selling:
1. Lots are consumed in chronological order (oldest first)
2. Cost basis is tracked per-lot
3. Realized P&L = Sale Proceeds - Consumed Cost Basis - Fees
4. Remaining quantity per lot is tracked

### DCA (Dollar-Cost Averaging)

When buying:
1. Total cost basis += Purchase Amount + Fees
2. Total quantity += Purchase Quantity

When selling:
1. Average cost = Total Cost Basis / Total Quantity
2. Cost basis consumed = Quantity Sold × Average Cost
3. Realized P&L = Sale Proceeds - Cost Basis Consumed - Fees
4. Total cost basis -= Cost Basis Consumed
5. Total quantity -= Quantity Sold

## Acceptance Tests

### Test 1: Three Buys with Different Prices
```
Buy 1: 0.5 BTC @ $40,000 + $50 fee
Buy 2: 0.3 BTC @ $45,000 + $30 fee
Buy 3: 0.2 BTC @ $42,000 + $20 fee

FIFO Mode:
- 3 lots visible
- Total cost = $43,100
- Avg cost = $43,100 / 1.0 BTC = $43,100/BTC

DCA Mode:
- Single position
- Total cost = $43,100
- Avg cost = $43,100/BTC
```

### Test 2: Partial Sell
```
Sell 0.4 BTC @ $48,000 - $40 fee

FIFO Mode:
- Lot 1: 0.1 BTC remaining (consumed 0.4 from 0.5)
- Lot 2: 0.3 BTC remaining (untouched)
- Lot 3: 0.2 BTC remaining (untouched)
- Realized P&L = (0.4 × $48,000 - $40) - (0.4 × $40,100) = $3,120

DCA Mode:
- 0.6 BTC remaining
- New avg cost recalculated
- Realized P&L = (0.4 × $48,000 - $40) - (0.4 × $43,100) = $1,920
```

### Test 3: Price Staleness
- Prices older than 5 minutes trigger warning banner
- Manual refresh updates all Binance-tracked assets
- Timestamp displayed in "Xm Ys ago" format

## Architecture

### Frontend
- React with TypeScript
- Supabase client for database access
- Real-time price updates
- Responsive UI with mobile support

### Backend
- Supabase PostgreSQL database
- Row Level Security (RLS) for multi-user support
- Edge Functions for price fetching
- Binance API integration

### Security
- User authentication via Supabase Auth
- RLS policies ensure data isolation
- API keys managed via environment variables
- CORS headers properly configured

## Future Enhancements

1. **Per-Asset Tracking Preferences**: Allow users to set FIFO vs DCA per individual asset
2. **Edit Transaction**: Implement transaction editing with downstream lot recomputation
3. **Calendar View**: Daily P&L visualization with per-coin breakdown
4. **Asset Picker**: Search interface with auto-complete for adding new assets
5. **Multi-Exchange Support**: OKX, Bybit, Gate.io price sources
6. **Tax Reporting**: Export transactions for tax filing
7. **Advanced Analytics**: Charts, performance metrics, allocation visualization
8. **Alerts**: Price alerts and portfolio milestone notifications

## Troubleshooting

### Prices Not Updating
1. Check Supabase Edge Function logs
2. Verify Binance API is accessible
3. Ensure assets have `binance_symbol` populated
4. Try manual refresh

### Transactions Not Appearing
1. Verify user is authenticated
2. Check RLS policies in Supabase
3. Ensure asset_id references valid asset

### Build Errors
1. Run `npm install` to ensure dependencies are installed
2. Check TypeScript errors with `npm run build`
3. Verify environment variables are set

## License

This project is part of the CryptoTracker application.
