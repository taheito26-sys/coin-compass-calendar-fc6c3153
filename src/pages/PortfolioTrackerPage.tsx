import { useState, useEffect } from "react";
import { supabase, getAssets, getTransactions, getPriceCaches, fetchPricesFromBinance, addTransaction, type Asset, type Transaction, type PriceCache } from "@/lib/supabaseClient";
import { calculatePortfolio, isPriceStale, type PortfolioSummary } from "@/lib/portfolioCalculations";
import { fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";

export default function PortfolioTrackerPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [priceCaches, setPriceCaches] = useState<PriceCache[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [trackingMode, setTrackingMode] = useState<'fifo' | 'dca'>('fifo');
  const [loading, setLoading] = useState(true);
  const [priceStale, setPriceStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [showAddTx, setShowAddTx] = useState(false);
  const [txForm, setTxForm] = useState({
    type: 'buy' as 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'reward' | 'fee',
    assetId: '',
    qty: '',
    unitPrice: '',
    feeAmount: '0',
    feeCurrency: 'USD',
    venue: '',
    note: '',
  });

  useEffect(() => {
    loadData();
    checkAuth();

    const interval = setInterval(() => {
      if (priceCaches.length > 0) {
        const latestPrice = priceCaches.reduce((latest, cache) => {
          const cacheTime = new Date(cache.timestamp).getTime();
          return cacheTime > latest ? cacheTime : latest;
        }, 0);
        setPriceStale(isPriceStale(new Date(latestPrice).toISOString()));
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [priceCaches]);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadData() {
    try {
      setLoading(true);
      const [assetsData, pricesData] = await Promise.all([
        getAssets(),
        getPriceCaches(),
      ]);

      setAssets(assetsData);
      setPriceCaches(pricesData);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const txData = await getTransactions(user.id);
        setTransactions(txData);

        const portfolioData = calculatePortfolio(txData, assetsData, pricesData, trackingMode);
        setPortfolio(portfolioData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices() {
    try {
      setRefreshing(true);
      await fetchPricesFromBinance();
      await loadData();
      setPriceStale(false);
    } catch (error) {
      console.error('Error refreshing prices:', error);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAddTransaction() {
    if (!txForm.assetId || !txForm.qty || !txForm.unitPrice) {
      alert('Please fill required fields');
      return;
    }

    try {
      await addTransaction({
        timestamp: new Date().toISOString(),
        type: txForm.type,
        asset_id: txForm.assetId,
        qty: parseFloat(txForm.qty),
        unit_price: parseFloat(txForm.unitPrice),
        fee_amount: parseFloat(txForm.feeAmount) || 0,
        fee_currency: txForm.feeCurrency,
        venue: txForm.venue || null,
        note: txForm.note || null,
        tags: null,
        updated_at: new Date().toISOString(),
      });

      setShowAddTx(false);
      setTxForm({
        type: 'buy',
        assetId: '',
        qty: '',
        unitPrice: '',
        feeAmount: '0',
        feeCurrency: 'USD',
        venue: '',
        note: '',
      });
      await loadData();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Error adding transaction');
    }
  }

  useEffect(() => {
    if (transactions.length > 0 && assets.length > 0) {
      const portfolioData = calculatePortfolio(transactions, assets, priceCaches, trackingMode);
      setPortfolio(portfolioData);
    }
  }, [trackingMode, transactions, assets, priceCaches]);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-body">Loading portfolio...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="panel">
        <div className="panel-body">Please sign in to use the portfolio tracker.</div>
      </div>
    );
  }

  const priceAge = priceCaches.length > 0
    ? Math.floor((Date.now() - new Date(priceCaches[0].timestamp).getTime()) / 1000)
    : 0;

  return (
    <>
      {priceStale && (
        <div className="panel" style={{ marginBottom: 10, border: '2px solid var(--warn)' }}>
          <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚠</span>
              <span style={{ color: 'var(--warn)', fontWeight: 700 }}>
                Prices are stale (last updated {Math.floor(priceAge / 60)} min ago)
              </span>
            </div>
            <button className="btn" onClick={refreshPrices} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : '↻ Refresh Prices'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={() => setShowAddTx(!showAddTx)}>
          + Add Transaction
        </button>
        <button className="btn secondary" onClick={refreshPrices} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : '↻ Refresh Prices'}
        </button>
        <div className="seg">
          <button
            className={trackingMode === 'fifo' ? 'active' : ''}
            onClick={() => setTrackingMode('fifo')}
          >
            FIFO (Lots)
          </button>
          <button
            className={trackingMode === 'dca' ? 'active' : ''}
            onClick={() => setTrackingMode('dca')}
          >
            DCA (Avg)
          </button>
        </div>
        <span className="pill">Prices: {Math.floor(priceAge / 60)}m {priceAge % 60}s ago</span>
      </div>

      {showAddTx && (
        <div className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-head">
            <h2>Add Transaction</h2>
          </div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-field">
              <label className="form-label">Type</label>
              <select
                className="inp"
                value={txForm.type}
                onChange={e => setTxForm({ ...txForm, type: e.target.value as any })}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="transfer_in">Transfer In</option>
                <option value="transfer_out">Transfer Out</option>
                <option value="reward">Reward</option>
                <option value="fee">Fee</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Asset</label>
              <select
                className="inp"
                value={txForm.assetId}
                onChange={e => setTxForm({ ...txForm, assetId: e.target.value })}
              >
                <option value="">Select asset...</option>
                {assets.map(asset => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} - {asset.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                step="0.00000001"
                className="inp"
                value={txForm.qty}
                onChange={e => setTxForm({ ...txForm, qty: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Unit Price</label>
              <input
                type="number"
                step="0.01"
                className="inp"
                value={txForm.unitPrice}
                onChange={e => setTxForm({ ...txForm, unitPrice: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Fee Amount</label>
              <input
                type="number"
                step="0.01"
                className="inp"
                value={txForm.feeAmount}
                onChange={e => setTxForm({ ...txForm, feeAmount: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Venue (Exchange)</label>
              <input
                className="inp"
                value={txForm.venue}
                onChange={e => setTxForm({ ...txForm, venue: e.target.value })}
                placeholder="Binance, Coinbase..."
              />
            </div>
            <div className="form-field" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Note</label>
              <input
                className="inp"
                value={txForm.note}
                onChange={e => setTxForm({ ...txForm, note: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
              <button className="btn secondary" onClick={() => setShowAddTx(false)}>
                Cancel
              </button>
              <button className="btn" onClick={handleAddTransaction}>
                Add Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {portfolio && (
        <>
          <div className="kpis">
            <div className="kpi-card">
              <div className="kpi-lbl">PORTFOLIO VALUE</div>
              <div className="kpi-val">{fmtFiat(portfolio.totalValue, 'USD')}</div>
              <div className="kpi-sub">{portfolio.positions.length} positions</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">TOTAL COST</div>
              <div className="kpi-val">{fmtFiat(portfolio.totalCost, 'USD')}</div>
              <div className="kpi-sub">Cost basis</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <span className={`kpi-badge ${portfolio.totalUnrealizedPnL >= 0 ? 'good' : 'bad'}`}>
                  {portfolio.totalUnrealizedPnL >= 0 ? '▲' : '▼'}
                </span>
              </div>
              <div className="kpi-lbl">UNREALIZED P&L</div>
              <div className={`kpi-val ${portfolio.totalUnrealizedPnL >= 0 ? 'good' : 'bad'}`}>
                {(portfolio.totalUnrealizedPnL >= 0 ? '+' : '') + fmtFiat(portfolio.totalUnrealizedPnL, 'USD')}
              </div>
              <div className="kpi-sub">
                {portfolio.totalCost > 0
                  ? ((portfolio.totalUnrealizedPnL / portfolio.totalCost) * 100).toFixed(2) + '%'
                  : '—'}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">REALIZED P&L</div>
              <div className={`kpi-val ${portfolio.totalRealizedPnL >= 0 ? 'good' : 'bad'}`}>
                {(portfolio.totalRealizedPnL >= 0 ? '+' : '') + fmtFiat(portfolio.totalRealizedPnL, 'USD')}
              </div>
              <div className="kpi-sub">From sales</div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 10 }}>
            <div className="panel-head">
              <h2>Positions</h2>
              <span className="pill">{trackingMode.toUpperCase()} Mode</span>
            </div>
            <div className="panel-body">
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Quantity</th>
                      <th>Avg Cost</th>
                      <th>Current Price</th>
                      <th>Market Value</th>
                      <th>Cost Basis</th>
                      <th>Unrealized P&L</th>
                      <th>Realized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.length > 0 ? (
                      portfolio.positions.map(pos => (
                        <tr key={pos.assetId}>
                          <td className="mono" style={{ fontWeight: 900 }}>
                            {pos.symbol}
                            <div className="muted" style={{ fontSize: 9, marginTop: 2 }}>{pos.name}</div>
                          </td>
                          <td className="mono">{fmtQty(pos.qty)}</td>
                          <td className="mono">{fmtPx(pos.avgCost)} USD</td>
                          <td className="mono">
                            {pos.currentPrice !== null ? fmtPx(pos.currentPrice) + ' USD' : '—'}
                          </td>
                          <td className="mono">
                            {pos.marketValue !== null ? fmtFiat(pos.marketValue, 'USD') : '—'}
                          </td>
                          <td className="mono">{fmtFiat(pos.costBasis, 'USD')}</td>
                          <td className={`mono ${pos.unrealizedPnL !== null ? (pos.unrealizedPnL >= 0 ? 'good' : 'bad') : ''}`} style={{ fontWeight: 900 }}>
                            {pos.unrealizedPnL !== null
                              ? (pos.unrealizedPnL >= 0 ? '+' : '') + fmtFiat(pos.unrealizedPnL, 'USD')
                              : '—'}
                          </td>
                          <td className={`mono ${pos.realizedPnL >= 0 ? 'good' : 'bad'}`}>
                            {(pos.realizedPnL >= 0 ? '+' : '') + fmtFiat(pos.realizedPnL, 'USD')}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="muted">No positions yet. Add your first transaction above.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {trackingMode === 'fifo' && portfolio.positions.some(p => p.lots.length > 0) && (
            <div className="panel" style={{ marginTop: 10 }}>
              <div className="panel-head">
                <h2>Lots (FIFO)</h2>
              </div>
              <div className="panel-body">
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Acquired</th>
                        <th>Qty Remaining</th>
                        <th>Unit Cost</th>
                        <th>Total Cost</th>
                        <th>Venue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.positions.flatMap(pos =>
                        pos.lots.map(lot => (
                          <tr key={lot.id}>
                            <td className="mono" style={{ fontWeight: 900 }}>{lot.symbol}</td>
                            <td className="mono">{new Date(lot.timestamp).toLocaleDateString()}</td>
                            <td className="mono">{fmtQty(lot.qtyRemaining)}</td>
                            <td className="mono">{fmtPx(lot.unitCost)} USD</td>
                            <td className="mono">{fmtFiat(lot.qtyRemaining * lot.unitCost, 'USD')}</td>
                            <td className="mono muted">{lot.venue || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 10 }}>
            <div className="panel-head">
              <h2>Transaction History</h2>
              <span className="pill">{transactions.length} transactions</span>
            </div>
            <div className="panel-body">
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Asset</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                      <th>Fee</th>
                      <th>Venue</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length > 0 ? (
                      transactions.slice(0, 50).map(tx => (
                        <tr key={tx.id}>
                          <td className="mono">{new Date(tx.timestamp).toLocaleString()}</td>
                          <td className={`mono ${tx.type === 'buy' ? 'good' : tx.type === 'sell' ? 'bad' : ''}`} style={{ fontWeight: 900 }}>
                            {tx.type.toUpperCase()}
                          </td>
                          <td className="mono" style={{ fontWeight: 900 }}>{tx.assets.symbol}</td>
                          <td className="mono">{fmtQty(tx.qty)}</td>
                          <td className="mono">{fmtPx(tx.unit_price)} USD</td>
                          <td className="mono">{fmtFiat(tx.qty * tx.unit_price, 'USD')}</td>
                          <td className="mono">{fmtFiat(tx.fee_amount, tx.fee_currency)}</td>
                          <td className="mono muted">{tx.venue || '—'}</td>
                          <td className="mono muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {tx.note || '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="muted">No transactions yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
