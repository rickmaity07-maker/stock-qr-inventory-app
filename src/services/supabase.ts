import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Product, StockTransaction } from '../types/inventory';

let supabaseInstance: SupabaseClient | null = null;
let instanceKey = '';
let realtimeChannel: RealtimeChannel | null = null;

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  const cleanUrl = url?.trim();
  const cleanKey = anonKey?.trim();
  if (!cleanUrl || !cleanKey || !/^https:\/\//i.test(cleanUrl)) {
    return null;
  }
  const key = `${cleanUrl}|${cleanKey}`;
  if (!supabaseInstance || instanceKey !== key) {
    resetSupabaseClient();
    supabaseInstance = createClient(cleanUrl, cleanKey, {
      auth: { persistSession: false },
    });
    instanceKey = key;
  }
  return supabaseInstance;
}

export function resetSupabaseClient() {
  if (realtimeChannel && supabaseInstance) {
    supabaseInstance.removeChannel(realtimeChannel);
  }
  realtimeChannel = null;
  supabaseInstance = null;
  instanceKey = '';
}

export function mapDbRowToProduct(row: Record<string, any>): Product {
  const quantity = Number(row.quantity) || 0;
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category || 'General'),
    qrCode: String(row.qr_code),
    factoryBarcode: row.factory_barcode ? String(row.factory_barcode) : undefined,
    buyingPrice: Number(row.buying_price) || 0,
    sellingPrice: Number(row.selling_price) || 0,
    quantity,
    openingQuantity:
      row.opening_quantity === null || row.opening_quantity === undefined
        ? undefined
        : Number(row.opening_quantity),
    minStockLevel:
      row.min_stock_level === null || row.min_stock_level === undefined
        ? 5
        : Number(row.min_stock_level),
    expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
    deleted: row.deleted === true,
    updatedAt: String(row.updated_at || new Date(0).toISOString()),
    synced: true,
  };
}

export function mapProductToDbRow(product: Product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    qr_code: product.qrCode,
    factory_barcode: product.factoryBarcode || null,
    buying_price: product.buyingPrice,
    selling_price: product.sellingPrice,
    quantity: product.quantity,
    opening_quantity: product.openingQuantity ?? product.quantity,
    min_stock_level: product.minStockLevel,
    expiry_date: product.expiryDate || null,
    deleted: Boolean(product.deleted),
    updated_at: product.updatedAt,
  };
}

export function mapDbRowToTransaction(row: Record<string, any>): StockTransaction {
  const type = row.type === 'RESTOCK' ? 'RESTOCK' : row.type === 'ADJUST' ? 'ADJUST' : 'SALE';
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    type,
    quantity: Number(row.quantity) || 0,
    unitBuyingPrice: Number(row.unit_buying_price) || 0,
    unitSellingPrice: Number(row.unit_selling_price) || 0,
    performedByRole: row.performed_by_role === 'OWNER' ? 'OWNER' : 'STAFF',
    notes: row.notes ? String(row.notes) : undefined,
    timestamp: new Date(row.timestamp || 0).toISOString(),
    synced: true,
  };
}

export function mapTransactionToDbRow(tx: StockTransaction) {
  return {
    id: tx.id,
    product_id: tx.productId,
    product_name: tx.productName,
    type: tx.type,
    quantity: tx.quantity,
    unit_buying_price: tx.unitBuyingPrice,
    unit_selling_price: tx.unitSellingPrice,
    performed_by_role: tx.performedByRole,
    notes: tx.notes || null,
    timestamp: tx.timestamp,
  };
}

/** Supabase returns at most 1000 rows per request, so read the table page by page. */
export async function fetchAllRows(
  client: SupabaseClient,
  table: 'products' | 'transactions',
  orderColumn: string
): Promise<Record<string, any>[]> {
  const pageSize = 1000;
  const rows: Record<string, any>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Explains the most likely fix when the cloud table is from an older schema. */
export function explainSupabaseError(err: any): string {
  const msg = String(err?.message || err || 'Unknown error');
  if (/column .* does not exist|opening_quantity|deleted|violates check constraint/i.test(msg)) {
    return `${msg}\n\nYour Supabase tables are from an older version. Run supabase/schema.sql again in the Supabase SQL editor (it is safe to re-run).`;
  }
  return msg;
}

export function subscribeToLiveSync(
  client: SupabaseClient,
  onRemoteUpdate: () => void
): () => void {
  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
  }

  realtimeChannel = client
    .channel('inventory-live-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onRemoteUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onRemoteUpdate)
    .subscribe();

  return () => {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}
