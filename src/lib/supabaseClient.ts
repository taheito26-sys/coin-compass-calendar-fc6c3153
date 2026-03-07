import { supabase } from '@/integrations/supabase/client';
export { supabase };

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  coingecko_id: string | null;
  binance_symbol: string | null;
  precision_qty: number;
  precision_price: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  timestamp: string;
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'reward' | 'fee' | 'adjustment';
  asset_id: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
  fee_currency: string;
  venue: string | null;
  note: string | null;
  tags: string[] | null;
  created_at: string;
}

export interface TrackingPreference {
  id: string;
  user_id: string;
  asset_id: string | null;
  tracking_mode: 'fifo' | 'dca';
}

export interface PriceCache {
  asset_id: string;
  price: number;
  source: string;
  timestamp: string;
}

export async function fetchPricesFromBinance() {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-prices', {
      method: 'POST',
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching prices:', error);
    throw error;
  }
}

export async function getAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('symbol');

  if (error) throw error;
  return data as Asset[];
}

export async function getTransactions(userId: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, assets(symbol, name)')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getPriceCaches() {
  const { data, error } = await supabase
    .from('price_cache')
    .select('*, assets(symbol, name)');

  if (error) throw error;
  return data;
}

export async function getTrackingPreference(userId: string, assetId?: string) {
  let query = supabase
    .from('tracking_preferences')
    .select('*')
    .eq('user_id', userId);

  if (assetId) {
    query = query.eq('asset_id', assetId);
  } else {
    query = query.is('asset_id', null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data as TrackingPreference | null;
}

export async function setTrackingPreference(
  userId: string,
  trackingMode: 'fifo' | 'dca',
  assetId?: string
) {
  const { data, error } = await supabase
    .from('tracking_preferences')
    .upsert({
      user_id: userId,
      asset_id: assetId || null,
      tracking_mode: trackingMode,
    }, {
      onConflict: 'user_id,asset_id',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addTransaction(transaction: Omit<Transaction, 'id' | 'user_id' | 'created_at'>) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...transaction,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
