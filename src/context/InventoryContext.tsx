import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {
  CloudConfig,
  InventoryState,
  MonthlySummary,
  Product,
  ScannerMode,
  StockTransaction,
  UserRole,
} from '../types/inventory';
import { INITIAL_PRODUCTS, INITIAL_TRANSACTIONS } from '../utils/seedData';
import {
  explainSupabaseError,
  fetchAllRows,
  getSupabaseClient,
  mapDbRowToProduct,
  mapDbRowToTransaction,
  mapProductToDbRow,
  mapTransactionToDbRow,
  resetSupabaseClient,
  subscribeToLiveSync,
} from '../services/supabase';
import { pollPackets, publishState } from '../services/liveRelay';
import {
  activeProducts,
  availableMonths as buildAvailableMonths,
  buildMonthlySummary,
  compareVersions,
  daysUntil,
  findProductByCode as findByCode,
  generateUniqueQrCode,
  isLowStock,
  mergeStates,
  newId,
  normalizeState,
  parsePairingPayload,
  recomputeQuantities,
  sameContent,
  sortTransactions,
  syncCodeFromBytes,
} from '../logic/inventoryLogic';

const STORAGE_KEYS = {
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
};

// Replaced automatically by CI when building the locked Client Demo APK
export const DEFAULT_CLIENT_DEMO_LOCKED = false;
/** Unlocks a Client Demo build. Anyone with the APK can extract it, so treat it as a demo gate only. */
export const MASTER_LICENSE_KEY = 'MOBILE-PRO-2026';
const DEFAULT_PIN = '1234';
const DEMO_ACTION_LIMIT = 3;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;
const RELAY_POLL_MS = 5_000;
const SYNC_DEBOUNCE_MS = 900;
const UPDATE_MANIFEST_URLS = [
  'https://raw.githubusercontent.com/rickmaity07-maker/stock-qr-inventory-app/main/docs/live-update.json',
  'https://rickmaity07-maker.github.io/stock-qr-inventory-app/live-update.json',
];

export const APP_VERSION = `v${Constants.expoConfig?.version ?? '0.0.0'}`;

export interface AddProductInput {
  name: string;
  category: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  minStockLevel: number;
  factoryBarcode?: string;
  expiryDate?: string;
}

export type ProductEdits = Partial<
  Pick<
    Product,
    'name' | 'category' | 'buyingPrice' | 'sellingPrice' | 'minStockLevel' | 'factoryBarcode' | 'expiryDate' | 'quantity'
  >
>;

export type SyncMode = 'supabase' | 'relay' | 'off';
export type PinResult = 'ok' | 'wrong' | 'locked';

export interface AppUpdateInfo {
  latestVersion: string;
  installedVersion: string;
  isNewer: boolean;
  notes: string;
  apkUrl: string | null;
}

interface InventoryContextValue {
  isReady: boolean;
  /** Products that are not deleted */
  products: Product[];
  transactions: StockTransaction[];
  role: UserRole;
  scannerMode: ScannerMode;
  pinIsDefault: boolean;
  pinLockedUntil: number;
  cloudConfig: CloudConfig;
  syncMode: SyncMode;
  syncCode: string;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  unsyncedCount: number;
  lowStockProducts: Product[];
  expiringProducts: Product[];
  isSampleData: boolean;
  isClientDemoLocked: boolean;
  demoActionsRemaining: number;
  consumeDemoAction: () => boolean;
  enableClientDemoLock: () => Promise<void>;
  unlockClientDemo: (licenseOrPin: string) => Promise<boolean>;
  setScannerMode: (mode: ScannerMode) => void;
  switchToStaffRole: () => Promise<void>;
  unlockOwnerRole: (pin: string) => Promise<PinResult>;
  updateOwnerPin: (newPin: string) => Promise<void>;
  addProduct: (input: AddProductInput) => Promise<Product>;
  updateProduct: (id: string, updates: ProductEdits) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  linkFactoryBarcode: (productId: string, barcode: string) => Promise<void>;
  findProductByCode: (scannedCode: string) => Product | undefined;
  getProduct: (id: string) => Product | undefined;
  recordSale: (
    productId: string,
    quantity: number,
    notes?: string
  ) => Promise<{ product: Product; lowStockTriggered: boolean }>;
  recordRestock: (
    productId: string,
    quantity: number,
    newBuyingPrice: number,
    expiryDate?: string,
    notes?: string
  ) => Promise<Product>;
  getMonthlySummary: (monthKey: string) => MonthlySummary;
  availableMonths: { key: string; label: string }[];
  updateCloudConfig: (config: CloudConfig) => Promise<void>;
  syncWithCloud: () => Promise<{ ok: boolean; message: string }>;
  joinStoreSync: (codeOrPayload: string) => Promise<{ ok: boolean; message: string }>;
  createNewSyncCode: () => Promise<void>;
  resetToDemoData: () => Promise<void>;
  startFreshStore: () => Promise<void>;
  checkForAppUpdate: () => Promise<AppUpdateInfo>;
}

const InventoryContext = createContext<InventoryContextValue | undefined>(undefined);

export class InventoryError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'BARCODE_IN_USE' | 'INVALID', message: string) {
    super(message);
  }
}

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `stockqr-pin:${pin.trim()}`);
}

function newSyncCode(): string {
  return syncCodeFromBytes(Crypto.getRandomBytes(26));
}

function sampleState(): InventoryState {
  return normalizeState({ products: INITIAL_PRODUCTS, transactions: INITIAL_TRANSACTIONS });
}

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [state, setState] = useState<InventoryState>({ products: [], transactions: [] });
  const stateRef = useRef<InventoryState>(state);

  const [role, setRole] = useState<UserRole>('OWNER');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('SELL');
  const [pinHash, setPinHash] = useState<string>('');
  const [pinIsDefault, setPinIsDefault] = useState(true);
  const [pinLockedUntil, setPinLockedUntil] = useState(0);
  const failedPinAttempts = useRef(0);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    autoSyncEnabled: true,
  });
  const [syncCode, setSyncCode] = useState('');
  const deviceIdRef = useRef('');
  const relayLastIdRef = useRef<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isSampleData, setIsSampleData] = useState(false);
  const [isClientDemoLocked, setIsClientDemoLocked] = useState(DEFAULT_CLIENT_DEMO_LOCKED);
  const [demoActionsRemaining, setDemoActionsRemaining] = useState(DEMO_ACTION_LIMIT);

  // ---- persistence -------------------------------------------------------

  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback((next: InventoryState) => {
    writeQueue.current = writeQueue.current
      .then(() =>
        AsyncStorage.multiSet([
          [STORAGE_KEYS.PRODUCTS, JSON.stringify(next.products)],
          [STORAGE_KEYS.TRANSACTIONS, JSON.stringify(next.transactions)],
        ])
      )
      .catch((err) => console.warn('Could not save inventory:', err));
    return writeQueue.current;
  }, []);

  const scheduleSyncRef = useRef<() => void>(() => {});

  /** The only way inventory state changes: updates memory, screen and storage together. */
  const commit = useCallback(
    (next: InventoryState, opts: { sync?: boolean } = {}) => {
      stateRef.current = next;
      setState(next);
      const saved = persist(next);
      if (opts.sync !== false) scheduleSyncRef.current();
      return saved;
    },
    [persist]
  );

  // ---- load on launch ----------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const entries = Object.fromEntries(
          await AsyncStorage.multiGet(Object.values(STORAGE_KEYS))
        ) as Record<string, string | null>;

        let loaded: InventoryState | null = null;
        try {
          const prods = JSON.parse(entries[STORAGE_KEYS.PRODUCTS] || 'null');
          const txs = JSON.parse(entries[STORAGE_KEYS.TRANSACTIONS] || '[]');
          if (Array.isArray(prods)) {
            loaded = normalizeState({ products: prods, transactions: Array.isArray(txs) ? txs : [] });
          }
        } catch (err) {
          console.warn('Saved inventory was unreadable:', err);
        }

        if (loaded) {
          stateRef.current = loaded;
          setState(loaded);
          setIsSampleData(entries[STORAGE_KEYS.IS_SAMPLE_DATA] === 'true');
          await persist(loaded); // stores the migrated shape (opening quantities)
        } else {
          const sample = sampleState();
          stateRef.current = sample;
          setState(sample);
          setIsSampleData(true);
          await persist(sample);
          await AsyncStorage.setItem(STORAGE_KEYS.IS_SAMPLE_DATA, 'true');
        }

        const savedRole = entries[STORAGE_KEYS.ROLE];
        if (savedRole === 'OWNER' || savedRole === 'STAFF') setRole(savedRole);

        // PIN: migrate the old plain-text PIN to a hash
        let hash = entries[STORAGE_KEYS.OWNER_PIN_HASH];
        if (!hash) {
          const legacy = entries[STORAGE_KEYS.OWNER_PIN] || DEFAULT_PIN;
          hash = await hashPin(legacy);
          await AsyncStorage.setItem(STORAGE_KEYS.OWNER_PIN_HASH, hash);
          await AsyncStorage.setItem(STORAGE_KEYS.PIN_IS_DEFAULT, String(legacy === DEFAULT_PIN));
          await AsyncStorage.removeItem(STORAGE_KEYS.OWNER_PIN);
          setPinIsDefault(legacy === DEFAULT_PIN);
        } else {
          setPinIsDefault(entries[STORAGE_KEYS.PIN_IS_DEFAULT] !== 'false');
        }
        setPinHash(hash);

        if (entries[STORAGE_KEYS.CLOUD_CONFIG]) {
          try {
            const cfg = JSON.parse(entries[STORAGE_KEYS.CLOUD_CONFIG] as string);
            setCloudConfig({
              supabaseUrl: String(cfg.supabaseUrl || ''),
              supabaseAnonKey: String(cfg.supabaseAnonKey || ''),
              autoSyncEnabled: cfg.autoSyncEnabled !== false,
            });
          } catch {
            // keep defaults
          }
        }

        let deviceId = entries[STORAGE_KEYS.DEVICE_ID];
        if (!deviceId) {
          deviceId = `dev-${newSyncCode().slice(0, 12)}`;
          await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
        }
        deviceIdRef.current = deviceId;

        let code = entries[STORAGE_KEYS.SYNC_CODE];
        if (!code) {
          code = newSyncCode();
          await AsyncStorage.setItem(STORAGE_KEYS.SYNC_CODE, code);
        }
        setSyncCode(code);
        relayLastIdRef.current = entries[STORAGE_KEYS.RELAY_LAST_ID] || null;

        if (entries[STORAGE_KEYS.CLIENT_DEMO_LOCK] !== null) {
          setIsClientDemoLocked(entries[STORAGE_KEYS.CLIENT_DEMO_LOCK] === 'true');
        }
        const savedDemo = Number(entries[STORAGE_KEYS.DEMO_ACTIONS]);
        if (entries[STORAGE_KEYS.DEMO_ACTIONS] !== null && Number.isFinite(savedDemo)) {
          setDemoActionsRemaining(Math.max(0, Math.min(DEMO_ACTION_LIMIT, savedDemo)));
        }
      } catch (err) {
        console.warn('Failed to load offline inventory state:', err);
        const sample = sampleState();
        stateRef.current = sample;
        setState(sample);
      } finally {
        setIsReady(true);
      }
    })();
  }, [persist]);

  // ---- client demo lock --------------------------------------------------

  const enableClientDemoLock = useCallback(async () => {
    setIsClientDemoLocked(true);
    setDemoActionsRemaining(DEMO_ACTION_LIMIT);
    setRole('STAFF');
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.CLIENT_DEMO_LOCK, 'true'],
      [STORAGE_KEYS.DEMO_ACTIONS, String(DEMO_ACTION_LIMIT)],
      [STORAGE_KEYS.ROLE, 'STAFF'],
    ]);
  }, []);

  const unlockClientDemo = useCallback(
    async (licenseOrPin: string): Promise<boolean> => {
      const clean = licenseOrPin.trim();
      const ok = clean.toUpperCase() === MASTER_LICENSE_KEY || (await hashPin(clean)) === pinHash;
      if (!ok) return false;
      setIsClientDemoLocked(false);
      setRole('OWNER');
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.CLIENT_DEMO_LOCK, 'false'],
        [STORAGE_KEYS.ROLE, 'OWNER'],
      ]);
      return true;
    },
    [pinHash]
  );

  const demoRemainingRef = useRef(demoActionsRemaining);
  demoRemainingRef.current = demoActionsRemaining;

  const consumeDemoAction = useCallback((): boolean => {
    if (!isClientDemoLocked) return true;
    if (demoRemainingRef.current <= 0) return false;
    const next = demoRemainingRef.current - 1;
    demoRemainingRef.current = next;
    setDemoActionsRemaining(next);
    AsyncStorage.setItem(STORAGE_KEYS.DEMO_ACTIONS, String(next)).catch(() => {});
    return true;
  }, [isClientDemoLocked]);

  // ---- roles & PIN -------------------------------------------------------

  const switchToStaffRole = useCallback(async () => {
    setRole('STAFF');
    await AsyncStorage.setItem(STORAGE_KEYS.ROLE, 'STAFF');
  }, []);

  const unlockOwnerRole = useCallback(
    async (pin: string): Promise<PinResult> => {
      if (Date.now() < pinLockedUntil) return 'locked';
      if ((await hashPin(pin)) === pinHash) {
        failedPinAttempts.current = 0;
        setRole('OWNER');
        await AsyncStorage.setItem(STORAGE_KEYS.ROLE, 'OWNER');
        return 'ok';
      }
      failedPinAttempts.current += 1;
      if (failedPinAttempts.current >= MAX_PIN_ATTEMPTS) {
        failedPinAttempts.current = 0;
        setPinLockedUntil(Date.now() + PIN_LOCKOUT_MS);
        return 'locked';
      }
      return 'wrong';
    },
    [pinHash, pinLockedUntil]
  );

  const updateOwnerPin = useCallback(async (newPin: string) => {
    const clean = newPin.trim();
    if (!/^\d{4,8}$/.test(clean)) throw new InventoryError('INVALID', 'PIN must be 4 to 8 digits.');
    const hash = await hashPin(clean);
    setPinHash(hash);
    setPinIsDefault(clean === DEFAULT_PIN);
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.OWNER_PIN_HASH, hash],
      [STORAGE_KEYS.PIN_IS_DEFAULT, String(clean === DEFAULT_PIN)],
    ]);
  }, []);

  // ---- product & stock changes ------------------------------------------

  const getProduct = useCallback(
    (id: string) => stateRef.current.products.find((p) => p.id === id && !p.deleted),
    []
  );

  const addProduct = useCallback(
    async (input: AddProductInput): Promise<Product> => {
      const cur = stateRef.current;
      const name = input.name.trim();
      if (!name) throw new InventoryError('INVALID', 'Product name is required.');
      const barcode = input.factoryBarcode?.trim() || undefined;
      if (barcode) {
        const clash = activeProducts(cur.products).find(
          (p) => p.factoryBarcode?.toUpperCase() === barcode.toUpperCase()
        );
        if (clash) throw new InventoryError('BARCODE_IN_USE', `Barcode is already linked to ${clash.name}.`);
      }
      const opening = Math.max(0, Math.floor(Number(input.quantity) || 0));
      const product: Product = {
        id: newId('prod'),
        name,
        category: input.category.trim() || 'General',
        qrCode: generateUniqueQrCode(
          name,
          cur.products.map((p) => p.qrCode)
        ),
        factoryBarcode: barcode,
        buyingPrice: Math.max(0, Number(input.buyingPrice) || 0),
        sellingPrice: Math.max(0, Number(input.sellingPrice) || 0),
        quantity: opening,
        openingQuantity: opening,
        minStockLevel: Math.max(0, Math.floor(Number.isFinite(input.minStockLevel) ? input.minStockLevel : 5)),
        expiryDate: input.expiryDate?.trim() || undefined,
        updatedAt: new Date().toISOString(),
        synced: false,
      };
      await commit({ products: [product, ...cur.products], transactions: cur.transactions });
      return product;
    },
    [commit]
  );

  const updateProduct = useCallback(
    async (id: string, updates: ProductEdits) => {
      const cur = stateRef.current;
      const target = cur.products.find((p) => p.id === id);
      if (!target) throw new InventoryError('NOT_FOUND', 'Product not found.');
      const { quantity: wantedQty, ...fields } = updates;
      const now = new Date().toISOString();

      if (fields.factoryBarcode) {
        const code = fields.factoryBarcode.trim().toUpperCase();
        const clash = activeProducts(cur.products).find(
          (p) => p.id !== id && p.factoryBarcode?.toUpperCase() === code
        );
        if (clash) throw new InventoryError('BARCODE_IN_USE', `Barcode is already linked to ${clash.name}.`);
      }

      let transactions = cur.transactions;
      // A changed stock count becomes a correction entry, so every phone agrees on it.
      if (typeof wantedQty === 'number' && Number.isFinite(wantedQty)) {
        const delta = Math.floor(wantedQty) - target.quantity;
        if (delta !== 0) {
          const adj: StockTransaction = {
            id: newId('tx'),
            productId: id,
            productName: fields.name?.trim() || target.name,
            type: 'ADJUST',
            quantity: delta,
            unitBuyingPrice: fields.buyingPrice ?? target.buyingPrice,
            unitSellingPrice: fields.sellingPrice ?? target.sellingPrice,
            performedByRole: role,
            notes: 'Stock count corrected',
            timestamp: now,
            synced: false,
          };
          transactions = sortTransactions([adj, ...transactions]);
        }
      }

      const products = cur.products.map((p) =>
        p.id === id
          ? {
              ...p,
              ...fields,
              name: (fields.name ?? p.name).trim(),
              factoryBarcode:
                fields.factoryBarcode === undefined ? p.factoryBarcode : fields.factoryBarcode.trim() || undefined,
              expiryDate: fields.expiryDate === undefined ? p.expiryDate : fields.expiryDate.trim() || undefined,
              updatedAt: now,
              synced: false,
            }
          : p
      );
      await commit({ products: recomputeQuantities(products, transactions), transactions });
    },
    [commit, role]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const cur = stateRef.current;
      const now = new Date().toISOString();
      const products = cur.products.map((p) =>
        p.id === id ? { ...p, deleted: true, updatedAt: now, synced: false } : p
      );
      await commit({ products, transactions: cur.transactions });
    },
    [commit]
  );

  const linkFactoryBarcode = useCallback(
    async (productId: string, barcode: string) => {
      await updateProduct(productId, { factoryBarcode: barcode.trim() });
    },
    [updateProduct]
  );

  const findProductByCode = useCallback(
    (scannedCode: string) => findByCode(stateRef.current.products, scannedCode),
    // state in deps so screens re-render with fresh results
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state]
  );

  const recordSale = useCallback(
    async (productId: string, quantity: number, notes?: string) => {
      const cur = stateRef.current;
      const target = cur.products.find((p) => p.id === productId && !p.deleted);
      if (!target) throw new InventoryError('NOT_FOUND', 'Product not found.');
      const sellQty = Math.max(1, Math.floor(quantity));
      if (sellQty > target.quantity) {
        throw new InventoryError(
          'INSUFFICIENT_STOCK',
          `Only ${Math.max(0, target.quantity)} of ${target.name} in stock.`
        );
      }
      const tx: StockTransaction = {
        id: newId('tx'),
        productId: target.id,
        productName: target.name,
        type: 'SALE',
        quantity: sellQty,
        unitBuyingPrice: target.buyingPrice,
        unitSellingPrice: target.sellingPrice,
        performedByRole: role,
        notes,
        timestamp: new Date().toISOString(),
        synced: false,
      };
      const transactions = [tx, ...cur.transactions];
      const products = recomputeQuantities(cur.products, transactions);
      await commit({ products, transactions });
      const updated = products.find((p) => p.id === productId) as Product;
      return { product: updated, lowStockTriggered: isLowStock(updated) };
    },
    [commit, role]
  );

  const recordRestock = useCallback(
    async (
      productId: string,
      quantity: number,
      newBuyingPrice: number,
      expiryDate?: string,
      notes?: string
    ) => {
      const cur = stateRef.current;
      const target = cur.products.find((p) => p.id === productId && !p.deleted);
      if (!target) throw new InventoryError('NOT_FOUND', 'Product not found.');
      const addQty = Math.max(1, Math.floor(quantity));
      const buyPrice =
        Number.isFinite(newBuyingPrice) && newBuyingPrice >= 0 ? newBuyingPrice : target.buyingPrice;
      const now = new Date().toISOString();
      const tx: StockTransaction = {
        id: newId('tx'),
        productId: target.id,
        productName: target.name,
        type: 'RESTOCK',
        quantity: addQty,
        unitBuyingPrice: buyPrice,
        unitSellingPrice: target.sellingPrice,
        performedByRole: role,
        notes,
        timestamp: now,
        synced: false,
      };
      const transactions = [tx, ...cur.transactions];
      const changedDetails =
        buyPrice !== target.buyingPrice || (expiryDate?.trim() && expiryDate.trim() !== target.expiryDate);
      const products = recomputeQuantities(
        cur.products.map((p) =>
          p.id === productId && changedDetails
            ? {
                ...p,
                buyingPrice: buyPrice,
                expiryDate: expiryDate?.trim() || p.expiryDate,
                updatedAt: now,
                synced: false,
              }
            : p
        ),
        transactions
      );
      await commit({ products, transactions });
      return products.find((p) => p.id === productId) as Product;
    },
    [commit, role]
  );

  // ---- sync --------------------------------------------------------------

  const syncMode: SyncMode =
    cloudConfig.supabaseUrl && cloudConfig.supabaseAnonKey
      ? 'supabase'
      : cloudConfig.autoSyncEnabled && syncCode
      ? 'relay'
      : 'off';

  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);

  /** Marks the records we just uploaded as synced, unless they changed again meanwhile. */
  const markUploaded = useCallback((uploaded: InventoryState, base: InventoryState): InventoryState => {
    const prodVersions = new Map(uploaded.products.map((p) => [p.id, p.updatedAt]));
    const txIds = new Set(uploaded.transactions.map((t) => t.id));
    return {
      products: base.products.map((p) =>
        !p.synced && prodVersions.get(p.id) === p.updatedAt ? { ...p, synced: true } : p
      ),
      transactions: base.transactions.map((t) => (!t.synced && txIds.has(t.id) ? { ...t, synced: true } : t)),
    };
  }, []);

  const runSupabaseSync = useCallback(async () => {
    const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    if (!client) throw new Error('Supabase URL must start with https:// and the key must be filled in.');
    const snapshot = stateRef.current;
    const upProds = snapshot.products.filter((p) => !p.synced);
    const upTxs = snapshot.transactions.filter((t) => !t.synced);
    if (upProds.length) {
      const { error } = await client.from('products').upsert(upProds.map(mapProductToDbRow));
      if (error) throw error;
    }
    if (upTxs.length) {
      const { error } = await client.from('transactions').upsert(upTxs.map(mapTransactionToDbRow));
      if (error) throw error;
    }
    const [prodRows, txRows] = await Promise.all([
      fetchAllRows(client, 'products', 'updated_at'),
      fetchAllRows(client, 'transactions', 'timestamp'),
    ]);
    const remote: InventoryState = {
      products: prodRows.map(mapDbRowToProduct),
      transactions: txRows.map(mapDbRowToTransaction),
    };
    const latest = markUploaded({ products: upProds, transactions: upTxs }, stateRef.current);
    const merged = mergeStates(latest, remote);
    if (!sameContent(merged, stateRef.current) || upProds.length || upTxs.length) {
      await commit(merged, { sync: false });
    }
  }, [cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey, commit, markUploaded]);

  const runRelayPublish = useCallback(async () => {
    const snapshot = stateRef.current;
    const ok = await publishState(syncCode, deviceIdRef.current, snapshot);
    if (!ok) throw new Error('Offline — changes are saved on this phone and will sync when you are back online.');
    await commit(markUploaded(snapshot, stateRef.current), { sync: false });
  }, [syncCode, commit, markUploaded]);

  const syncWithCloud = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (syncMode === 'off') {
      return { ok: false, message: 'Sync is turned off. Changes are saved on this phone only.' };
    }
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return { ok: true, message: 'Sync already running.' };
    }
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      do {
        syncAgainRef.current = false;
        if (syncMode === 'supabase') await runSupabaseSync();
        else await runRelayPublish();
      } while (syncAgainRef.current);
      setLastSyncedAt(new Date().toISOString());
      setLastSyncError(null);
      return {
        ok: true,
        message:
          syncMode === 'supabase'
            ? 'Synced with your Supabase database.'
            : 'Synced with every phone paired to this store.',
      };
    } catch (err: any) {
      const message = syncMode === 'supabase' ? explainSupabaseError(err) : String(err?.message || err);
      setLastSyncError(message);
      return { ok: false, message };
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [syncMode, runSupabaseSync, runRelayPublish]);

  const syncRef = useRef(syncWithCloud);
  syncRef.current = syncWithCloud;

  // Debounced sync after every local change
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  scheduleSyncRef.current = () => {
    if (!cloudConfig.autoSyncEnabled || syncMode === 'off') return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      syncRef.current();
    }, SYNC_DEBOUNCE_MS);
  };

  // Track whether the app is in the foreground (no polling in the background)
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Relay: share our state on launch / resume, then poll for other phones' changes
  useEffect(() => {
    if (!isReady || syncMode !== 'relay' || !appActive) return;
    let cancelled = false;
    let polling = false;

    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const { packets, lastId } = await pollPackets(syncCode, deviceIdRef.current, relayLastIdRef.current);
        if (cancelled) return;
        if (lastId && lastId !== relayLastIdRef.current) {
          relayLastIdRef.current = lastId;
          AsyncStorage.setItem(STORAGE_KEYS.RELAY_LAST_ID, lastId).catch(() => {});
        }
        if (packets.length) {
          const merged = packets.reduce<InventoryState>(
            (acc, pkt) => mergeStates(acc, { products: pkt.products, transactions: pkt.transactions }),
            stateRef.current
          );
          if (!sameContent(merged, stateRef.current)) await commit(merged, { sync: false });
          setLastSyncedAt(new Date().toISOString());
        }
        setLastSyncError(null);
      } catch {
        // offline: try again next tick
      } finally {
        polling = false;
      }
    };

    syncRef.current();
    poll();
    const timer = setInterval(poll, RELAY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isReady, syncMode, syncCode, appActive, commit]);

  // Supabase: sync on launch and whenever another device changes a row
  useEffect(() => {
    if (!isReady || syncMode !== 'supabase' || !cloudConfig.autoSyncEnabled) return;
    const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    if (!client) return;
    syncRef.current();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToLiveSync(client, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncRef.current(), 600);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [isReady, syncMode, cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey, cloudConfig.autoSyncEnabled]);

  const joinStoreSync = useCallback(
    async (codeOrPayload: string) => {
      const code = parsePairingPayload(codeOrPayload);
      if (!code) return { ok: false, message: 'That is not a valid store sync code.' };
      if (code === syncCode) return { ok: true, message: 'This phone is already paired with that store.' };
      relayLastIdRef.current = null;
      setSyncCode(code);
      await AsyncStorage.multiSet([[STORAGE_KEYS.SYNC_CODE, code]]);
      await AsyncStorage.removeItem(STORAGE_KEYS.RELAY_LAST_ID);
      // Everything on this phone gets shared with the store on the next sync
      const cur = stateRef.current;
      await commit(
        {
          products: cur.products.map((p) => ({ ...p, synced: false })),
          transactions: cur.transactions.map((t) => ({ ...t, synced: false })),
        },
        { sync: false }
      );
      if (!cloudConfig.autoSyncEnabled) {
        const cfg = { ...cloudConfig, autoSyncEnabled: true };
        setCloudConfig(cfg);
        await AsyncStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(cfg));
      }
      return { ok: true, message: 'Paired. This phone now shares stock and sales with the store.' };
    },
    [syncCode, cloudConfig, commit]
  );

  const createNewSyncCode = useCallback(async () => {
    const code = newSyncCode();
    relayLastIdRef.current = null;
    setSyncCode(code);
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_CODE, code);
    await AsyncStorage.removeItem(STORAGE_KEYS.RELAY_LAST_ID);
  }, []);

  const updateCloudConfig = useCallback(async (config: CloudConfig) => {
    resetSupabaseClient();
    const clean: CloudConfig = {
      supabaseUrl: config.supabaseUrl.trim(),
      supabaseAnonKey: config.supabaseAnonKey.trim(),
      autoSyncEnabled: config.autoSyncEnabled,
    };
    setCloudConfig(clean);
    await AsyncStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(clean));
  }, []);

  // ---- data resets -------------------------------------------------------

  const resetToDemoData = useCallback(async () => {
    await commit(sampleState(), { sync: false });
    setIsSampleData(true);
    await AsyncStorage.setItem(STORAGE_KEYS.IS_SAMPLE_DATA, 'true');
  }, [commit]);

  /** Clears the sample catalogue and starts an empty store with its own new sync code. */
  const startFreshStore = useCallback(async () => {
    await commit({ products: [], transactions: [] }, { sync: false });
    setIsSampleData(false);
    await AsyncStorage.setItem(STORAGE_KEYS.IS_SAMPLE_DATA, 'false');
    await createNewSyncCode();
  }, [commit, createNewSyncCode]);

  // ---- app updates -------------------------------------------------------

  const checkForAppUpdate = useCallback(async (): Promise<AppUpdateInfo> => {
    let lastError: unknown = null;
    for (const url of UPDATE_MANIFEST_URLS) {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) continue;
        const manifest = await res.json();
        const latestVersion = String(manifest.version || APP_VERSION);
        const apkUrl =
          typeof manifest.apkDownloadUrl === 'string' && manifest.apkDownloadUrl.startsWith('https://github.com/')
            ? manifest.apkDownloadUrl
            : null;
        return {
          latestVersion,
          installedVersion: APP_VERSION,
          isNewer: compareVersions(latestVersion, APP_VERSION) > 0,
          notes: String(manifest.notes || ''),
          apkUrl,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Could not reach the update server.');
  }, []);

  // ---- derived values ----------------------------------------------------

  const visibleProducts = useMemo(() => activeProducts(state.products), [state.products]);

  const lowStockProducts = useMemo(
    () => visibleProducts.filter(isLowStock).sort((a, b) => a.quantity - b.quantity),
    [visibleProducts]
  );

  const expiringProducts = useMemo(
    () =>
      visibleProducts
        .filter((p) => p.expiryDate && daysUntil(p.expiryDate) !== null)
        .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '')),
    [visibleProducts]
  );

  const unsyncedCount = useMemo(
    () =>
      state.products.filter((p) => !p.synced).length + state.transactions.filter((t) => !t.synced).length,
    [state]
  );

  const availableMonths = useMemo(() => buildAvailableMonths(state.transactions), [state.transactions]);

  const getMonthlySummary = useCallback(
    (monthKey: string) => buildMonthlySummary(state.products, state.transactions, monthKey),
    [state]
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      isReady,
      products: visibleProducts,
      transactions: state.transactions,
      role,
      scannerMode,
      pinIsDefault,
      pinLockedUntil,
      cloudConfig,
      syncMode,
      syncCode,
      isSyncing,
      lastSyncedAt,
      lastSyncError,
      unsyncedCount,
      lowStockProducts,
      expiringProducts,
      isSampleData,
      isClientDemoLocked,
      demoActionsRemaining,
      consumeDemoAction,
      enableClientDemoLock,
      unlockClientDemo,
      setScannerMode,
      switchToStaffRole,
      unlockOwnerRole,
      updateOwnerPin,
      addProduct,
      updateProduct,
      deleteProduct,
      linkFactoryBarcode,
      findProductByCode,
      getProduct,
      recordSale,
      recordRestock,
      getMonthlySummary,
      availableMonths,
      updateCloudConfig,
      syncWithCloud,
      joinStoreSync,
      createNewSyncCode,
      resetToDemoData,
      startFreshStore,
      checkForAppUpdate,
    }),
    [
      isReady,
      visibleProducts,
      state.transactions,
      role,
      scannerMode,
      pinIsDefault,
      pinLockedUntil,
      cloudConfig,
      syncMode,
      syncCode,
      isSyncing,
      lastSyncedAt,
      lastSyncError,
      unsyncedCount,
      lowStockProducts,
      expiringProducts,
      isSampleData,
      isClientDemoLocked,
      demoActionsRemaining,
      consumeDemoAction,
      enableClientDemoLock,
      unlockClientDemo,
      switchToStaffRole,
      unlockOwnerRole,
      updateOwnerPin,
      addProduct,
      updateProduct,
      deleteProduct,
      linkFactoryBarcode,
      findProductByCode,
      getProduct,
      recordSale,
      recordRestock,
      getMonthlySummary,
      availableMonths,
      updateCloudConfig,
      syncWithCloud,
      joinStoreSync,
      createNewSyncCode,
      resetToDemoData,
      startFreshStore,
      checkForAppUpdate,
    ]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return ctx;
}
