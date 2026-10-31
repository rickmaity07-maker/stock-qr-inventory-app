/**
 * On-device storage (AsyncStorage on phones, localStorage on the web).
 * Keys keep their old names so data from earlier versions loads unchanged.
 */
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
