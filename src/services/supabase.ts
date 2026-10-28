import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Product, StockTransaction } from '../types/inventory';

let supabaseInstance: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  const cleanUrl = url?.trim();
  const cleanKey = anonKey?.trim();
  if (!cleanUrl || !cleanKey || !cleanUrl.startsWith('http')) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(cleanUrl, cleanKey, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabaseInstance;
}

export function resetSupabaseClient() {
  if (realtimeChannel && supabaseInstance) {
    supabaseInstance.removeChannel(realtimeChannel);
  }
  realtimeChannel = null;
  supabaseInstance = null;
}

export function mapDbRowToProduct(row: Record<string, any>): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category || 'General'),
    qrCode: String(row.qr_code),
    factoryBarcode: row.factory_barcode ? String(row.factory_barcode) : undefined,
    buyingPrice: Number(row.buying_price) || 0,
    sellingPrice: Number(row.selling_price) || 0,
    quantity: Number(row.quantity) || 0,
    minStockLevel: Number(row.min_stock_level) || 5,
    expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
    updatedAt: String(row.updated_at || new Date().toISOString()),
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
    min_stock_level: product.minStockLevel,
    expiry_date: product.expiryDate || null,
    updated_at: product.updatedAt,
  };
}

export function mapDbRowToTransaction(row: Record<string, any>): StockTransaction {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    type: row.type === 'RESTOCK' ? 'RESTOCK' : 'SALE',
    quantity: Number(row.quantity) || 1,
    unitBuyingPrice: Number(row.unit_buying_price) || 0,
    unitSellingPrice: Number(row.unit_selling_price) || 0,
    performedByRole: row.performed_by_role === 'OWNER' ? 'OWNER' : 'STAFF',
    notes: row.notes ? String(row.notes) : undefined,
    timestamp: String(row.timestamp || new Date().toISOString()),
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

export function subscribeToLiveSync(
  client: SupabaseClient,
  onRemoteUpdate: () => void
): () => void {
  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
  }

  realtimeChannel = client
    .channel('inventory-live-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => {
        onRemoteUpdate();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions' },
      () => {
        onRemoteUpdate();
      }
    )
    .subscribe();

  return () => {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}
