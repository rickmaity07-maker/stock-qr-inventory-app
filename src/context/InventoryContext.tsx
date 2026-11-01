/**
 * App state: inventory, roles, settings. Storage lives in services/storage,
 * syncing in sync/useSyncEngine, and all inventory rules in logic/inventoryLogic.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { api, API_URL, clearSession, loadSession, saveSession, Session } from '../services/api';
import {
  createInventoryWriter,
  parseStoredInventory,
  readAll,
  readLegacyWebInventory,
  removeValue,
  setValue,
  setValues,
  STORAGE_KEYS,
} from '../services/storage';
import { BackupFile, buildBackup } from '../services/backup';
import { flushErrorReports } from '../services/crashReports';
import { SyncMode, useSyncEngine } from '../sync/useSyncEngine';
import { CurrencyCode, getCurrency, isCurrencyCode, setCurrency as setCurrencyModule } from '../logic/money';
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
  recomputeQuantities,
  sortTransactions,
} from '../logic/inventoryLogic';

export type { SyncMode } from '../sync/useSyncEngine';

// Replaced automatically by CI when building the locked Client Demo APK
export const DEFAULT_CLIENT_DEMO_LOCKED = false;
/** Unlocks a Client Demo build. Anyone with the APK can extract it, so treat it as a demo gate only. */
export const MASTER_LICENSE_KEY = 'MOBILE-PRO-2026';
const DEFAULT_PIN = '1234';
const DEMO_ACTION_LIMIT = 3;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;
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

export type PinResult = 'ok' | 'wrong' | 'locked';

export interface AppUpdateInfo {
  latestVersion: string;
  installedVersion: string;
  isNewer: boolean;
  notes: string;
  apkUrl: string | null;
}

export interface InventoryContextValue {
  isReady: boolean;
  /** Products that are not deleted */
  products: Product[];
  transactions: StockTransaction[];
  role: UserRole;
  scannerMode: ScannerMode;
  pinIsDefault: boolean;
  pinLockedUntil: number;
  currency: CurrencyCode;
  cloudConfig: CloudConfig;
  syncMode: SyncMode;
  /** Signed-in cloud account, or null when this phone works on its own. */
  account: { email: string } | null;
  serverConfigured: boolean;
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
  setCurrency: (code: CurrencyCode) => Promise<void>;
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
  signIn: (email: string, password: string) => Promise<void>;
  createOwnerAccount: (setupKey: string, email: string, password: string) => Promise<void>;
  /** Forgotten password: sets a new one with the setup key and signs out every other device. */
  resetPassword: (setupKey: string, email: string, newPassword: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetToDemoData: () => Promise<void>;
  startFreshStore: () => Promise<void>;
  makeBackup: () => BackupFile;
  restoreBackup: (backup: BackupFile) => Promise<{ products: number; transactions: number }>;
  checkForAppUpdate: () => Promise<AppUpdateInfo>;
}

const InventoryContext = createContext<InventoryContextValue | undefined>(undefined);

export class InventoryError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'BARCODE_IN_USE' | 'INVALID',
    message: string
  ) {
    super(message);
  }
}

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `stockqr-pin:${pin.trim()}`);
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
  const [pinHash, setPinHash] = useState('');
  const [pinIsDefault, setPinIsDefault] = useState(true);
  const [pinLockedUntil, setPinLockedUntil] = useState(0);
  const failedPinAttempts = useRef(0);
  const [currency, setCurrencyState] = useState<CurrencyCode>(getCurrency());
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({ autoSyncEnabled: true });
  const [session, setSession] = useState<Session | null>(null);
  const [initialCursor, setInitialCursor] = useState(0);
  const [isSampleData, setIsSampleData] = useState(false);
  const [isClientDemoLocked, setIsClientDemoLocked] = useState(DEFAULT_CLIENT_DEMO_LOCKED);
  const [demoActionsRemaining, setDemoActionsRemaining] = useState(DEMO_ACTION_LIMIT);

  // ---- the single write path ----------------------------------------------

  const writeInventory = useMemo(() => createInventoryWriter(), []);
  const scheduleSyncRef = useRef<() => void>(() => {});

  /** Updates memory, screen and storage together; then schedules a sync. */
  const commit = useCallback(
    (next: InventoryState, opts: { sync?: boolean } = {}) => {
      stateRef.current = next;
      setState(next);
      const saved = writeInventory(next);
      if (opts.sync !== false) scheduleSyncRef.current();
      return saved;
    },
    [writeInventory]
  );

  const onSessionExpired = useCallback(() => {
    setSession(null);
    clearSession().catch(() => {});
  }, []);

  const sync = useSyncEngine({
    isReady,
    session,
    autoSync: cloudConfig.autoSyncEnabled,
    initialCursor,
    stateRef,
    commit,
    onSessionExpired,
  });
  scheduleSyncRef.current = sync.scheduleSync;

  // ---- load on launch -------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const values = await readAll();
        const stored = parseStoredInventory(values);

        if (stored) {
          const loaded = normalizeState(stored);
          stateRef.current = loaded;
          setState(loaded);
          setIsSampleData(values[STORAGE_KEYS.IS_SAMPLE_DATA] === 'true');
          await writeInventory(loaded); // saves the migrated shape (opening quantities)
        } else {
          // Moving from the old iPhone page? Bring its stock and sales across.
          const legacy = readLegacyWebInventory();
          const first = legacy ? normalizeState(legacy) : sampleState();
          stateRef.current = first;
          setState(first);
          setIsSampleData(!legacy);
          await writeInventory(first);
          await setValue(STORAGE_KEYS.IS_SAMPLE_DATA, String(!legacy));
        }

        const savedRole = values[STORAGE_KEYS.ROLE];
        if (savedRole === 'OWNER' || savedRole === 'STAFF') setRole(savedRole);

        // PIN: migrate the old plain-text PIN to a hash
        let hash = values[STORAGE_KEYS.OWNER_PIN_HASH];
        if (!hash) {
          const legacy = values[STORAGE_KEYS.OWNER_PIN] || DEFAULT_PIN;
          hash = await hashPin(legacy);
          await setValues([
            [STORAGE_KEYS.OWNER_PIN_HASH, hash],
            [STORAGE_KEYS.PIN_IS_DEFAULT, String(legacy === DEFAULT_PIN)],
          ]);
          await removeValue(STORAGE_KEYS.OWNER_PIN);
          setPinIsDefault(legacy === DEFAULT_PIN);
        } else {
          setPinIsDefault(values[STORAGE_KEYS.PIN_IS_DEFAULT] !== 'false');
        }
        setPinHash(hash);

        const cur = values[STORAGE_KEYS.CURRENCY];
        if (isCurrencyCode(cur)) {
          setCurrencyModule(cur);
          setCurrencyState(cur);
        }

        if (values[STORAGE_KEYS.CLOUD_CONFIG]) {
          try {
            const cfg = JSON.parse(values[STORAGE_KEYS.CLOUD_CONFIG] as string);
            setCloudConfig({ autoSyncEnabled: cfg.autoSyncEnabled !== false });
          } catch {
            // keep defaults
          }
        }

        setInitialCursor(Number(values[STORAGE_KEYS.CLOUD_CURSOR]) || 0);
        try {
          setSession(await loadSession());
        } catch {
          setSession(null);
        }

        if (values[STORAGE_KEYS.CLIENT_DEMO_LOCK] !== null) {
          setIsClientDemoLocked(values[STORAGE_KEYS.CLIENT_DEMO_LOCK] === 'true');
        }
        const savedDemo = Number(values[STORAGE_KEYS.DEMO_ACTIONS]);
        if (values[STORAGE_KEYS.DEMO_ACTIONS] !== null && Number.isFinite(savedDemo)) {
          setDemoActionsRemaining(Math.max(0, Math.min(DEMO_ACTION_LIMIT, savedDemo)));
        }
      } catch (err) {
        // Storage unreadable: run on sample data in memory only. Never overwrite what is stored.
        console.warn('Failed to load offline inventory state:', err);
        const sample = sampleState();
        stateRef.current = sample;
        setState(sample);
      } finally {
        setIsReady(true);
      }
    })();
  }, [writeInventory]);

  // ---- client demo lock ---------------------------------------------------------

  const enableClientDemoLock = useCallback(async () => {
    setIsClientDemoLocked(true);
    setDemoActionsRemaining(DEMO_ACTION_LIMIT);
    setRole('STAFF');
    await setValues([
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
      await setValues([
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
    setValue(STORAGE_KEYS.DEMO_ACTIONS, String(next)).catch(() => {});
    return true;
  }, [isClientDemoLocked]);

  // ---- roles, PIN, currency -------------------------------------------------------

  const switchToStaffRole = useCallback(async () => {
    setRole('STAFF');
    await setValue(STORAGE_KEYS.ROLE, 'STAFF');
  }, []);

  const unlockOwnerRole = useCallback(
    async (pin: string): Promise<PinResult> => {
      if (Date.now() < pinLockedUntil) return 'locked';
      if ((await hashPin(pin)) === pinHash) {
        failedPinAttempts.current = 0;
        setRole('OWNER');
        await setValue(STORAGE_KEYS.ROLE, 'OWNER');
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
    await setValues([
      [STORAGE_KEYS.OWNER_PIN_HASH, hash],
      [STORAGE_KEYS.PIN_IS_DEFAULT, String(clean === DEFAULT_PIN)],
    ]);
  }, []);

  const setCurrency = useCallback(async (code: CurrencyCode) => {
    setCurrencyModule(code);
    setCurrencyState(code);
    await setValue(STORAGE_KEYS.CURRENCY, code);
  }, []);

  // ---- products & stock --------------------------------------------------------

  const getProduct = useCallback(
    (id: string) => stateRef.current.products.find((p) => p.id === id && !p.deleted),
    // re-create when state changes so screens re-read fresh data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state]
  );

  const assertBarcodeFree = (products: Product[], barcode: string, exceptId?: string) => {
    const code = barcode.trim().toUpperCase();
    if (!code) return;
    const clash = activeProducts(products).find(
      (p) => p.id !== exceptId && (p.factoryBarcode?.toUpperCase() === code || p.qrCode.toUpperCase() === code)
    );
    if (clash) throw new InventoryError('BARCODE_IN_USE', `That code is already used by ${clash.name}.`);
  };

  const addProduct = useCallback(
    async (input: AddProductInput): Promise<Product> => {
      const cur = stateRef.current;
      const name = input.name.trim();
      if (!name) throw new InventoryError('INVALID', 'Product name is required.');
      const barcode = input.factoryBarcode?.trim() || undefined;
      if (barcode) assertBarcodeFree(cur.products, barcode);
      const opening = Math.max(0, Math.floor(Number(input.quantity) || 0));
      const product: Product = {
        id: newId('prod'),
        name,
        category: input.category.trim() || 'General',
        qrCode: generateUniqueQrCode(name, cur.products.map((p) => p.qrCode)),
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
      if (fields.factoryBarcode) assertBarcodeFree(cur.products, fields.factoryBarcode, id);

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
      const products = cur.products.map((p) => (p.id === id ? { ...p, deleted: true, updatedAt: now, synced: false } : p));
      await commit({ products, transactions: cur.transactions });
    },
    [commit]
  );

  const linkFactoryBarcode = useCallback(
    (productId: string, barcode: string) => updateProduct(productId, { factoryBarcode: barcode.trim() }),
    [updateProduct]
  );

  const findProductByCode = useCallback(
    (scannedCode: string) => findByCode(stateRef.current.products, scannedCode),
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
        throw new InventoryError('INSUFFICIENT_STOCK', `Only ${Math.max(0, target.quantity)} of ${target.name} in stock.`);
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
    async (productId: string, quantity: number, newBuyingPrice: number, expiryDate?: string, notes?: string) => {
      const cur = stateRef.current;
      const target = cur.products.find((p) => p.id === productId && !p.deleted);
      if (!target) throw new InventoryError('NOT_FOUND', 'Product not found.');
      const addQty = Math.max(1, Math.floor(quantity));
      const buyPrice = Number.isFinite(newBuyingPrice) && newBuyingPrice >= 0 ? newBuyingPrice : target.buyingPrice;
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
      const newExpiry = expiryDate?.trim();
      const changedDetails = buyPrice !== target.buyingPrice || (newExpiry && newExpiry !== target.expiryDate);
      const products = recomputeQuantities(
        cur.products.map((p) =>
          p.id === productId && changedDetails
            ? { ...p, buyingPrice: buyPrice, expiryDate: newExpiry || p.expiryDate, updatedAt: now, synced: false }
            : p
        ),
        transactions
      );
      await commit({ products, transactions });
      return products.find((p) => p.id === productId) as Product;
    },
    [commit, role]
  );

  // ---- cloud account ---------------------------------------------------------------

  /**
   * After signing in: sample data is dropped (never uploaded), real local data is
   * marked for upload so the cloud gets everything this phone has.
   */
  const startSession = useCallback(
    async (s: Session) => {
      await saveSession(s);
      const cur = stateRef.current;
      if (isSampleData) {
        await commit({ products: [], transactions: [] }, { sync: false });
        setIsSampleData(false);
        await setValue(STORAGE_KEYS.IS_SAMPLE_DATA, 'false');
      } else {
        await commit(
          {
            products: cur.products.map((p) => ({ ...p, synced: false })),
            transactions: cur.transactions.map((t) => ({ ...t, synced: false })),
          },
          { sync: false }
        );
      }
      await sync.resetCursor();
      setSession(s);
    },
    [commit, isSampleData, sync]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email.trim().toLowerCase(), password);
      await startSession({ token: res.token, email: res.email });
    },
    [startSession]
  );

  const createOwnerAccount = useCallback(
    async (setupKey: string, email: string, password: string) => {
      const res = await api.setup(setupKey.trim(), email.trim().toLowerCase(), password);
      await startSession({ token: res.token, email: res.email });
    },
    [startSession]
  );

  const resetPassword = useCallback(
    async (setupKey: string, email: string, newPassword: string) => {
      const res = await api.resetPassword(setupKey.trim(), email.trim().toLowerCase(), newPassword);
      await startSession({ token: res.token, email: res.email });
    },
    [startSession]
  );

  // Send any saved crash reports once signed in
  useEffect(() => {
    if (session) flushErrorReports().catch(() => {});
  }, [session]);

  /** Signs this phone out. Its data stays on the phone. `everywhere` also signs out all other devices. */
  const signOut = useCallback(
    async (everywhere = false) => {
      if (everywhere && session) await api.logoutAll(session.token);
      await clearSession();
      setSession(null);
    },
    [session]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!session) throw new Error('Not signed in.');
      const res = await api.changePassword(session.token, currentPassword, newPassword);
      const next = { token: res.token, email: session.email };
      await saveSession(next);
      setSession(next);
    },
    [session]
  );

  const updateCloudConfig = useCallback(async (config: CloudConfig) => {
    const clean: CloudConfig = { autoSyncEnabled: config.autoSyncEnabled };
    setCloudConfig(clean);
    await setValue(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(clean));
  }, []);

  // ---- data management ----------------------------------------------------------------

  const resetToDemoData = useCallback(async () => {
    if (session) throw new InventoryError('INVALID', 'Sign out first — sample data must never be uploaded to your cloud account.');
    await commit(sampleState(), { sync: false });
    setIsSampleData(true);
    await setValue(STORAGE_KEYS.IS_SAMPLE_DATA, 'true');
  }, [commit, session]);

  /** Clears the sample catalogue so the owner can enter real products. */
  const startFreshStore = useCallback(async () => {
    await commit({ products: [], transactions: [] }, { sync: false });
    setIsSampleData(false);
    await setValue(STORAGE_KEYS.IS_SAMPLE_DATA, 'false');
    if (session) await sync.resetCursor();
  }, [commit, session, sync]);

  const makeBackup = useCallback(() => buildBackup(stateRef.current, APP_VERSION, getCurrency()), []);

  const restoreBackup = useCallback(
    async (backup: BackupFile) => {
      const incoming = normalizeState({ products: backup.products, transactions: backup.transactions });
      const merged = mergeStates(stateRef.current, incoming);
      // mark restored records as not yet shared so paired phones receive them
      const localIds = new Set(stateRef.current.transactions.map((t) => t.id));
      const next: InventoryState = {
        products: merged.products.map((p) => ({ ...p, synced: false })),
        transactions: merged.transactions.map((t) => (localIds.has(t.id) ? t : { ...t, synced: false })),
      };
      await commit(next);
      if (isSampleData && incoming.products.length) {
        setIsSampleData(false);
        await setValue(STORAGE_KEYS.IS_SAMPLE_DATA, 'false');
      }
      return { products: incoming.products.length, transactions: incoming.transactions.length };
    },
    [commit, isSampleData]
  );

  // ---- app updates --------------------------------------------------------------------

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

  // ---- derived values ----------------------------------------------------------------

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
    () => state.products.filter((p) => !p.synced).length + state.transactions.filter((t) => !t.synced).length,
    [state]
  );
  const availableMonths = useMemo(() => buildAvailableMonths(state.transactions), [state.transactions]);
  const getMonthlySummary = useCallback(
    (monthKey: string) => buildMonthlySummary(state.products, state.transactions, monthKey),
    [state]
  );

  const value: InventoryContextValue = {
    isReady,
    products: visibleProducts,
    transactions: state.transactions,
    role,
    scannerMode,
    pinIsDefault,
    pinLockedUntil,
    currency,
    cloudConfig,
    syncMode: sync.syncMode,
    account: session ? { email: session.email } : null,
    serverConfigured: Boolean(API_URL),
    isSyncing: sync.isSyncing,
    lastSyncedAt: sync.lastSyncedAt,
    lastSyncError: sync.lastSyncError,
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
    setCurrency,
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
    syncWithCloud: sync.syncNow,
    signIn,
    createOwnerAccount,
    resetPassword,
    signOut,
    changePassword,
    resetToDemoData,
    startFreshStore,
    makeBackup,
    restoreBackup,
    checkForAppUpdate,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within an InventoryProvider');
  return ctx;
}
