/**
 * On-device storage (AsyncStorage on phones, localStorage on the web).
 * Keys keep their old names so data from earlier versions loads unchanged.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InventoryState } from '../types/inventory';

export const STORAGE_KEYS = {
  PRODUCTS: '@stockqr_products_v4_mobile_only',
  TRANSACTIONS: '@stockqr_transactions_v4_mobile_only',
  ROLE: '@stockqr_role_v4_mobile_only',
  /** Legacy plain-text PIN (migrated to OWNER_PIN_HASH on first launch) */
  OWNER_PIN: '@stockqr_owner_pin_v4_mobile_only',
  OWNER_PIN_HASH: '@stockqr_owner_pin_hash_v5',
  PIN_IS_DEFAULT: '@stockqr_pin_is_default_v5',
  CLOUD_CONFIG: '@stockqr_cloud_config_v4_mobile_only',
  CLIENT_DEMO_LOCK: '@stockqr_client_demo_lock_v4',
  DEMO_ACTIONS: '@stockqr_demo_actions_v5',
  DEVICE_ID: '@stockqr_device_id_v5',
  SYNC_CODE: '@stockqr_sync_code_v5',
  RELAY_LAST_ID: '@stockqr_relay_last_id_v5',
  IS_SAMPLE_DATA: '@stockqr_is_sample_data_v5',
  CURRENCY: '@stockqr_currency_v5',
  CLOUD_CURSOR: '@stockqr_cloud_cursor_v6',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type StoredValues = Record<StorageKey, string | null>;

export async function readAll(): Promise<StoredValues> {
  const pairs = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
  return Object.fromEntries(pairs) as StoredValues;
}

export function setValue(key: StorageKey, value: string) {
  return AsyncStorage.setItem(key, value);
}

export function setValues(pairs: [StorageKey, string][]) {
  return AsyncStorage.multiSet(pairs);
}

export function removeValue(key: StorageKey) {
  return AsyncStorage.removeItem(key);
}

/** Parses the saved inventory; returns null when nothing (or nothing readable) is stored. */
export function parseStoredInventory(values: StoredValues): InventoryState | null {
  try {
    const products = JSON.parse(values[STORAGE_KEYS.PRODUCTS] || 'null');
    const transactions = JSON.parse(values[STORAGE_KEYS.TRANSACTIONS] || '[]');
    if (!Array.isArray(products)) return null;
    return { products, transactions: Array.isArray(transactions) ? transactions : [] };
  } catch {
    return null;
  }
}

/**
 * Writes inventory snapshots one after another, so a slow write can never
 * land after a newer one and roll the data back.
 */
export function createInventoryWriter() {
  let queue: Promise<void> = Promise.resolve();
  return (state: InventoryState): Promise<void> => {
    queue = queue
      .then(() =>
        AsyncStorage.multiSet([
          [STORAGE_KEYS.PRODUCTS, JSON.stringify(state.products)],
          [STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions)],
        ])
      )
      .catch((err) => console.warn('Could not save inventory:', err));
    return queue;
  };
}

/** Where the old hand-made iPhone page (docs/iphone-app.html) kept its data. */
export const LEGACY_WEB_KEY = 'stock_qr_mobile_only_ios_v5';

/**
 * Web only: reads stock and sales saved by the old iPhone page so moving to the
 * new app keeps them. Returns null when there is nothing to import.
 */
export function readLegacyWebInventory(): InventoryState | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = (globalThis as any).localStorage?.getItem(LEGACY_WEB_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.products) || data.products.length === 0) return null;
    const now = new Date().toISOString();
    return {
      products: data.products.map((p: any) => ({
        ...p,
        category: String(p.category || 'General'),
        buyingPrice: Number(p.buyingPrice) || 0,
        sellingPrice: Number(p.sellingPrice) || 0,
        quantity: Number(p.quantity) || 0,
        minStockLevel: Number.isFinite(Number(p.minStockLevel)) ? Number(p.minStockLevel) : 5,
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now,
        synced: false,
      })),
      transactions: (Array.isArray(data.transactions) ? data.transactions : []).map((t: any) => ({
        ...t,
        performedByRole: t.performedByRole === 'STAFF' ? 'STAFF' : 'OWNER',
        timestamp: new Date(t.timestamp).toISOString(),
        synced: false,
      })),
    };
  } catch {
    return null;
  }
}
