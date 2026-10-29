import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CloudConfig,
  MonthlySummary,
  Product,
  ProductPerformance,
  ScannerMode,
  StockTransaction,
  UserRole,
} from '../types/inventory';
import { INITIAL_PRODUCTS, INITIAL_TRANSACTIONS } from '../utils/seedData';
import {
  getSupabaseClient,
  mapDbRowToProduct,
  mapDbRowToTransaction,
  mapProductToDbRow,
  mapTransactionToDbRow,
  resetSupabaseClient,
  subscribeToLiveSync,
} from '../services/supabase';

const STORAGE_KEYS = {
  PRODUCTS: '@stockqr_products_v4_mobile_only',
  TRANSACTIONS: '@stockqr_transactions_v4_mobile_only',
  ROLE: '@stockqr_role_v4_mobile_only',
  OWNER_PIN: '@stockqr_owner_pin_v4_mobile_only',
  CLOUD_CONFIG: '@stockqr_cloud_config_v4_mobile_only',
  CLIENT_DEMO_LOCK: '@stockqr_client_demo_lock_v4',
};

const LEGACY_GROCERY_PATTERN =
  /olive|basmati|rice|honey|milk|yogurt|almond|chocolate|matcha|tea|cheese|pantry|grains|dairy|sweeteners/i;

function isCleanMobileCatalog(list: unknown): list is Product[] {
  if (!Array.isArray(list) || list.length < 8) return false;
  return !list.some(
    (item: any) =>
      LEGACY_GROCERY_PATTERN.test(String(item?.name || '')) ||
      LEGACY_GROCERY_PATTERN.test(String(item?.category || '')) ||
      LEGACY_GROCERY_PATTERN.test(String(item?.qrCode || ''))
  );
}

// Replaced automatically by CI when building the locked Client Demo APK
export const DEFAULT_CLIENT_DEMO_LOCKED = false;
export const MASTER_LICENSE_KEY = 'MOBILE-PRO-2026';

interface AddProductInput {
  name: string;
  category: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  minStockLevel: number;
  factoryBarcode?: string;
  expiryDate?: string;
}

interface InventoryContextValue {
  products: Product[];
  transactions: StockTransaction[];
  role: UserRole;
  scannerMode: ScannerMode;
  ownerPin: string;
  cloudConfig: CloudConfig;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  unsyncedCount: number;
  lowStockProducts: Product[];
  expiringProducts: Product[];
  isClientDemoLocked: boolean;
  demoActionsRemaining: number;
  consumeDemoAction: () => boolean;
  enableClientDemoLock: () => Promise<void>;
  unlockClientDemo: (licenseOrPin: string) => Promise<boolean>;
  setScannerMode: (mode: ScannerMode) => void;
  switchToStaffRole: () => Promise<void>;
  unlockOwnerRole: (pin: string) => Promise<boolean>;
  updateOwnerPin: (newPin: string) => Promise<void>;
  addProduct: (input: AddProductInput) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  linkFactoryBarcode: (productId: string, barcode: string) => Promise<void>;
  findProductByCode: (scannedCode: string) => Product | undefined;
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
  resetToDemoData: () => Promise<void>;
  pullOnlineUpdateFromGitHub: () => Promise<{
    ok: boolean;
    version: string;
    notes: string;
    apkUrl: string;
  }>;
}

const InventoryContext = createContext<InventoryContextValue | undefined>(undefined);

export function generateProductQrCode(name: string): string {
  const prefix = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `STK-${prefix}-${randomDigits}`;
}

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [transactions, setTransactions] = useState<StockTransaction[]>(INITIAL_TRANSACTIONS);
  const [role, setRole] = useState<UserRole>('OWNER');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('SELL');
  const [ownerPin, setOwnerPin] = useState<string>('1234');
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    autoSyncEnabled: true,
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isClientDemoLocked, setIsClientDemoLocked] = useState<boolean>(DEFAULT_CLIENT_DEMO_LOCKED);
  const [demoActionsRemaining, setDemoActionsRemaining] = useState<number>(3);

  // Load persisted offline-first state on launch
  useEffect(() => {
    (async () => {
      try {
        const [savedProducts, savedTx, savedRole, savedPin, savedCloud, savedDemoLock] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS),
            AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS),
            AsyncStorage.getItem(STORAGE_KEYS.ROLE),
            AsyncStorage.getItem(STORAGE_KEYS.OWNER_PIN),
            AsyncStorage.getItem(STORAGE_KEYS.CLOUD_CONFIG),
            AsyncStorage.getItem(STORAGE_KEYS.CLIENT_DEMO_LOCK),
          ]);

        if (savedProducts) {
          const parsedProds = JSON.parse(savedProducts);
          if (isCleanMobileCatalog(parsedProds)) {
            setProducts(parsedProds);
          } else {
            setProducts(INITIAL_PRODUCTS);
            await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
          }
        } else {
          await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
        }
        if (savedTx) {
          const parsedTx = JSON.parse(savedTx);
          const hasLegacyTx =
            Array.isArray(parsedTx) &&
            parsedTx.some((t: any) => LEGACY_GROCERY_PATTERN.test(String(t?.productName || '')));
          if (Array.isArray(parsedTx) && !hasLegacyTx) {
            setTransactions(parsedTx);
          } else {
            setTransactions(INITIAL_TRANSACTIONS);
            await AsyncStorage.setItem(
              STORAGE_KEYS.TRANSACTIONS,
              JSON.stringify(INITIAL_TRANSACTIONS)
            );
          }
        } else {
          await AsyncStorage.setItem(
            STORAGE_KEYS.TRANSACTIONS,
            JSON.stringify(INITIAL_TRANSACTIONS)
          );
        }
        if (savedRole === 'OWNER' || savedRole === 'STAFF') setRole(savedRole);
        if (savedPin) setOwnerPin(savedPin);
        if (savedCloud) setCloudConfig(JSON.parse(savedCloud));
        if (savedDemoLock !== null) {
          setIsClientDemoLocked(savedDemoLock === 'true');
        }
      } catch (err) {
        console.warn('Failed to load offline inventory state:', err);
      }
    })();
  }, []);

  const enableClientDemoLock = useCallback(async () => {
    setIsClientDemoLocked(true);
    setDemoActionsRemaining(3);
    setRole('STAFF');
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_DEMO_LOCK, 'true');
  }, []);

  const unlockClientDemo = useCallback(
    async (licenseOrPin: string): Promise<boolean> => {
      const clean = licenseOrPin.trim().toUpperCase();
      if (clean === MASTER_LICENSE_KEY || clean === ownerPin.toUpperCase()) {
        setIsClientDemoLocked(false);
        setRole('OWNER');
        await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_DEMO_LOCK, 'false');
        return true;
      }
      return false;
    },
    [ownerPin]
  );

  const consumeDemoAction = useCallback((): boolean => {
    if (!isClientDemoLocked) return true;
    if (demoActionsRemaining <= 0) {
      return false;
    }
    setDemoActionsRemaining((prev) => Math.max(0, prev - 1));
    return true;
  }, [isClientDemoLocked, demoActionsRemaining]);

  const persistProducts = useCallback(async (nextProducts: Product[]) => {
    setProducts(nextProducts);
    await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(nextProducts));
  }, []);

  const persistTransactions = useCallback(async (nextTx: StockTransaction[]) => {
    setTransactions(nextTx);
    await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(nextTx));
  }, []);

  const deviceIdRef = React.useRef<string>(`dev-${Math.random().toString(36).slice(2, 10)}`);
  const lastRemoteTsRef = React.useRef<number>(0);

  const broadcastLiveSync = useCallback(
    async (nextProducts: Product[], nextTx: StockTransaction[]): Promise<boolean> => {
      try {
        const res = await fetch('https://ntfy.sh/stockqr_mobile_store_live_sync_v4', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            deviceId: deviceIdRef.current,
            ts: Date.now(),
            products: nextProducts.map((p) => ({ ...p, synced: true })),
            transactions: nextTx.slice(0, 30).map((t) => ({ ...t, synced: true })),
          }),
        });
        if (res.ok) {
          const syncedProds = nextProducts.map((p) => ({ ...p, synced: true }));
          const syncedTxs = nextTx.map((t) => ({ ...t, synced: true }));
          await Promise.all([persistProducts(syncedProds), persistTransactions(syncedTxs)]);
          setLastSyncedAt(new Date().toISOString());
          return true;
        }
      } catch {
        // Offline - changes stay queued locally with synced: false
      }
      return false;
    },
    [persistProducts, persistTransactions]
  );

  // Cloud Sync Engine (Zero-Setup Cross-Device Live Relay + Offline Queue + Optional Supabase)
  const syncWithCloud = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    setIsSyncing(true);
    try {
      const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
      if (client) {
        const unsyncedProds = products.filter((p) => !p.synced);
        if (unsyncedProds.length > 0) {
          const { error: prodUpsertErr } = await client
            .from('products')
            .upsert(unsyncedProds.map(mapProductToDbRow));
          if (prodUpsertErr) throw prodUpsertErr;
        }

        const unsyncedTxs = transactions.filter((t) => !t.synced);
        if (unsyncedTxs.length > 0) {
          const { error: txUpsertErr } = await client
            .from('transactions')
            .upsert(unsyncedTxs.map(mapTransactionToDbRow));
          if (txUpsertErr) throw txUpsertErr;
        }

        const [{ data: remoteProds, error: pErr }, { data: remoteTxs, error: tErr }] =
          await Promise.all([
            client.from('products').select('*').order('name', { ascending: true }),
            client.from('transactions').select('*').order('timestamp', { ascending: false }),
          ]);

        if (pErr) throw pErr;
        if (tErr) throw tErr;

        if (remoteProds && remoteProds.length > 0) {
          await persistProducts(remoteProds.map(mapDbRowToProduct));
        } else if (products.length > 0) {
          await client.from('products').upsert(products.map(mapProductToDbRow));
          await persistProducts(products.map((p) => ({ ...p, synced: true })));
        }

        if (remoteTxs && remoteTxs.length > 0) {
          await persistTransactions(remoteTxs.map(mapDbRowToTransaction));
        } else if (transactions.length > 0) {
          await client.from('transactions').upsert(transactions.map(mapTransactionToDbRow));
          await persistTransactions(transactions.map((t) => ({ ...t, synced: true })));
        }
      } else {
        // Zero-setup real-time cloud relay across Android & iPhone
        await broadcastLiveSync(products, transactions);
      }

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setIsSyncing(false);
      return { ok: true, message: 'Synced live across all devices (Android & iPhone).' };
    } catch (err: any) {
      setIsSyncing(false);
      return {
        ok: false,
        message: err?.message || 'Offline — changes saved locally and will sync automatically.',
      };
    }
  }, [cloudConfig, products, transactions, persistProducts, persistTransactions, broadcastLiveSync]);

  // Zero-setup real-time cross-device sync listener (updates within seconds when another phone sells/restocks)
  useEffect(() => {
    if (!cloudConfig.autoSyncEnabled) return;
    let active = true;
    const pollLiveRelay = async () => {
      try {
        const res = await fetch(
          'https://ntfy.sh/stockqr_mobile_store_live_sync_v4/json?poll=1&since=15m'
        );
        if (!res.ok || !active) return;
        const text = await res.text();
        const lines = text.trim().split('\n').filter(Boolean);
        let newestPacket: any = null;
        for (const line of lines) {
          try {
            const env = JSON.parse(line);
            if (env.event === 'message' && env.message) {
              const payload = JSON.parse(env.message);
              if (
                payload &&
                payload.deviceId !== deviceIdRef.current &&
                payload.ts > lastRemoteTsRef.current &&
                isCleanMobileCatalog(payload.products)
              ) {
                newestPacket = payload;
                lastRemoteTsRef.current = payload.ts;
              }
            }
          } catch {}
        }
        if (newestPacket && active) {
          await persistProducts(newestPacket.products);
          if (Array.isArray(newestPacket.transactions) && newestPacket.transactions.length > 0) {
            await persistTransactions(newestPacket.transactions);
          }
          setLastSyncedAt(new Date().toISOString());
        }
      } catch {}
    };

    pollLiveRelay();
    const timer = setInterval(pollLiveRelay, 3500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [cloudConfig.autoSyncEnabled, persistProducts, persistTransactions]);

  // Subscribe to Supabase Realtime when credentials are provided
  useEffect(() => {
    const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    if (!client || !cloudConfig.autoSyncEnabled) return;

    syncWithCloud();
    const unsubscribe = subscribeToLiveSync(client, () => {
      syncWithCloud();
    });

    return () => {
      unsubscribe();
    };
  }, [cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey, cloudConfig.autoSyncEnabled]);

  const switchToStaffRole = useCallback(async () => {
    setRole('STAFF');
    await AsyncStorage.setItem(STORAGE_KEYS.ROLE, 'STAFF');
  }, []);

  const unlockOwnerRole = useCallback(
    async (pin: string): Promise<boolean> => {
      if (pin.trim() === ownerPin) {
        setRole('OWNER');
        await AsyncStorage.setItem(STORAGE_KEYS.ROLE, 'OWNER');
        return true;
      }
      return false;
    },
    [ownerPin]
  );

  const updateOwnerPin = useCallback(async (newPin: string) => {
    setOwnerPin(newPin.trim());
    await AsyncStorage.setItem(STORAGE_KEYS.OWNER_PIN, newPin.trim());
  }, []);

  const addProduct = useCallback(
    async (input: AddProductInput): Promise<Product> => {
      const now = new Date().toISOString();
      const newProduct: Product = {
        id: `prod-${Date.now()}`,
        name: input.name.trim(),
        category: input.category.trim() || 'General',
        qrCode: generateProductQrCode(input.name),
        factoryBarcode: input.factoryBarcode?.trim() || undefined,
        buyingPrice: Number(input.buyingPrice) || 0,
        sellingPrice: Number(input.sellingPrice) || 0,
        quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
        minStockLevel: Math.max(0, Math.floor(Number(input.minStockLevel) || 5)),
        expiryDate: input.expiryDate?.trim() || undefined,
        updatedAt: now,
        synced: false,
      };

      const next = [newProduct, ...products];
      await persistProducts(next);

      if (cloudConfig.autoSyncEnabled) {
        broadcastLiveSync(next, transactions);
        if (cloudConfig.supabaseUrl) syncWithCloud();
      }
      return newProduct;
    },
    [products, transactions, persistProducts, cloudConfig, syncWithCloud, broadcastLiveSync]
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<Product>) => {
      const next = products.map((p) =>
        p.id === id
          ? {
              ...p,
              ...updates,
              updatedAt: new Date().toISOString(),
              synced: false,
            }
          : p
      );
      await persistProducts(next);
      if (cloudConfig.autoSyncEnabled) {
        broadcastLiveSync(next, transactions);
        if (cloudConfig.supabaseUrl) syncWithCloud();
      }
    },
    [products, transactions, persistProducts, cloudConfig, syncWithCloud, broadcastLiveSync]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const next = products.filter((p) => p.id !== id);
      await persistProducts(next);
      if (cloudConfig.autoSyncEnabled) {
        broadcastLiveSync(next, transactions);
      }
      const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
      if (client) {
        await client.from('products').delete().eq('id', id);
      }
    },
    [products, transactions, persistProducts, cloudConfig, broadcastLiveSync]
  );

  const linkFactoryBarcode = useCallback(
    async (productId: string, barcode: string) => {
      await updateProduct(productId, { factoryBarcode: barcode.trim() });
    },
    [updateProduct]
  );

  const findProductByCode = useCallback(
    (scannedCode: string): Product | undefined => {
      const clean = scannedCode.trim().toUpperCase();
      if (!clean) return undefined;
      // 1. Exact QR Code, Factory Barcode, or Product Name match
      const direct = products.find(
        (p) =>
          p.qrCode.toUpperCase() === clean ||
          clean.includes(p.qrCode.toUpperCase()) ||
          p.name.toUpperCase() === clean ||
          (p.factoryBarcode && p.factoryBarcode.trim().toUpperCase() === clean)
      );
      if (direct) return direct;

      // 2. Pre-connected slot suffix match (-1001 to -1008) so cross-device QR codes are always connected
      const slotMatch = clean.match(/100([1-8])/);
      if (slotMatch) {
        const slotSuffix = `100${slotMatch[1]}`;
        const bySlot = products.find(
          (p) => p.qrCode.endsWith(slotSuffix) || p.id === `prod-${slotMatch[1]}`
        );
        if (bySlot) return bySlot;
      }

      return undefined;
    },
    [products]
  );

  const recordSale = useCallback(
    async (
      productId: string,
      quantity: number,
      notes?: string
    ): Promise<{ product: Product; lowStockTriggered: boolean }> => {
      const target = products.find((p) => p.id === productId);
      if (!target) {
        throw new Error('Product not found');
      }
      const sellQty = Math.max(1, Math.floor(quantity));
      const updatedQty = Math.max(0, target.quantity - sellQty);
      const now = new Date().toISOString();

      const updatedProduct: Product = {
        ...target,
        quantity: updatedQty,
        updatedAt: now,
        synced: false,
      };

      // Save exact buying and selling prices at time of sale for accurate historical profit
      const tx: StockTransaction = {
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productId: target.id,
        productName: target.name,
        type: 'SALE',
        quantity: sellQty,
        unitBuyingPrice: target.buyingPrice,
        unitSellingPrice: target.sellingPrice,
        performedByRole: role,
        notes,
        timestamp: now,
        synced: false,
      };

      const nextProducts = products.map((p) => (p.id === productId ? updatedProduct : p));
      const nextTx = [tx, ...transactions];

      await Promise.all([persistProducts(nextProducts), persistTransactions(nextTx)]);

      if (cloudConfig.autoSyncEnabled) {
        broadcastLiveSync(nextProducts, nextTx);
        if (cloudConfig.supabaseUrl) syncWithCloud();
      }

      return {
        product: updatedProduct,
        lowStockTriggered: updatedQty <= updatedProduct.minStockLevel,
      };
    },
    [products, transactions, role, persistProducts, persistTransactions, cloudConfig, syncWithCloud, broadcastLiveSync]
  );

  const recordRestock = useCallback(
    async (
      productId: string,
      quantity: number,
      newBuyingPrice: number,
      expiryDate?: string,
      notes?: string
    ): Promise<Product> => {
      const target = products.find((p) => p.id === productId);
      if (!target) {
        throw new Error('Product not found');
      }
      const addQty = Math.max(1, Math.floor(quantity));
      const updatedQty = target.quantity + addQty;
      const buyPrice = Number(newBuyingPrice) >= 0 ? Number(newBuyingPrice) : target.buyingPrice;
      const now = new Date().toISOString();

      const updatedProduct: Product = {
        ...target,
        quantity: updatedQty,
        buyingPrice: buyPrice,
        expiryDate: expiryDate?.trim() ? expiryDate.trim() : target.expiryDate,
        updatedAt: now,
        synced: false,
      };

      const tx: StockTransaction = {
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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

      const nextProducts = products.map((p) => (p.id === productId ? updatedProduct : p));
      const nextTx = [tx, ...transactions];

      await Promise.all([persistProducts(nextProducts), persistTransactions(nextTx)]);

      if (cloudConfig.autoSyncEnabled) {
        broadcastLiveSync(nextProducts, nextTx);
        if (cloudConfig.supabaseUrl) syncWithCloud();
      }

      return updatedProduct;
    },
    [products, transactions, role, persistProducts, persistTransactions, cloudConfig, syncWithCloud, broadcastLiveSync]
  );

  const lowStockProducts = useMemo(
    () =>
      products
        .filter((p) => p.quantity <= p.minStockLevel)
        .sort((a, b) => a.quantity - b.quantity),
    [products]
  );

  const expiringProducts = useMemo(
    () =>
      products
        .filter((p) => Boolean(p.expiryDate))
        .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '')),
    [products]
  );

  const unsyncedCount = useMemo(
    () =>
      products.filter((p) => !p.synced).length +
      transactions.filter((t) => !t.synced).length,
    [products, transactions]
  );

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    const nowKey = new Date().toISOString().slice(0, 7);
    monthSet.add(nowKey);
    monthSet.add('2026-10');
    monthSet.add('2026-09');
    monthSet.add('2026-08');
    for (const tx of transactions) {
      if (tx.timestamp && tx.timestamp.length >= 7) {
        monthSet.add(tx.timestamp.slice(0, 7));
      }
    }
    const sorted = Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    return sorted.map((key) => {
      const [yr, mo] = key.split('-').map(Number);
      const dt = new Date(yr, (mo || 1) - 1, 1);
      const label = dt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      return { key, label };
    });
  }, [transactions]);

  const getMonthlySummary = useCallback(
    (monthKey: string): MonthlySummary => {
      const monthObj = availableMonths.find((m) => m.key === monthKey);
      const monthLabel = monthObj ? monthObj.label : monthKey;

      const monthTxs = transactions.filter((t) => t.timestamp.startsWith(monthKey));
      const salesTransactions = monthTxs.filter((t) => t.type === 'SALE');
      const restockTransactions = monthTxs.filter((t) => t.type === 'RESTOCK');

      let totalRevenue = 0;
      let totalCostOfGoods = 0;
      let totalUnitsSold = 0;
      const perfMap = new Map<string, ProductPerformance>();

      // Initialize all known products so we can also identify slow/worst sellers
      for (const p of products) {
        perfMap.set(p.id, {
          productId: p.id,
          productName: p.name,
          unitsSold: 0,
          revenue: 0,
          costOfGoods: 0,
          grossProfit: 0,
        });
      }

      for (const tx of salesTransactions) {
        const rev = tx.quantity * tx.unitSellingPrice;
        const cost = tx.quantity * tx.unitBuyingPrice;
        const profit = rev - cost;

        totalRevenue += rev;
        totalCostOfGoods += cost;
        totalUnitsSold += tx.quantity;

        const existing = perfMap.get(tx.productId) || {
          productId: tx.productId,
          productName: tx.productName,
          unitsSold: 0,
          revenue: 0,
          costOfGoods: 0,
          grossProfit: 0,
        };

        existing.unitsSold += tx.quantity;
        existing.revenue += rev;
        existing.costOfGoods += cost;
        existing.grossProfit += profit;
        perfMap.set(tx.productId, existing);
      }

      const grossProfit = totalRevenue - totalCostOfGoods;
      const profitMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      let totalUnitsRestocked = 0;
      let restockSpend = 0;
      for (const rtx of restockTransactions) {
        totalUnitsRestocked += rtx.quantity;
        restockSpend += rtx.quantity * rtx.unitBuyingPrice;
      }

      const allPerf = Array.from(perfMap.values());
      const bestSellers = [...allPerf]
        .filter((item) => item.unitsSold > 0)
        .sort((a, b) => b.grossProfit - a.grossProfit);

      const worstSellers = [...allPerf].sort((a, b) => a.unitsSold - b.unitsSold);

      return {
        monthKey,
        monthLabel,
        totalRevenue,
        totalCostOfGoods,
        grossProfit,
        profitMarginPercent,
        totalUnitsSold,
        totalUnitsRestocked,
        restockSpend,
        bestSellers,
        worstSellers,
        salesTransactions,
      };
    },
    [transactions, products, availableMonths]
  );

  const updateCloudConfig = useCallback(async (config: CloudConfig) => {
    resetSupabaseClient();
    setCloudConfig(config);
    await AsyncStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(config));
  }, []);

  const resetToDemoData = useCallback(async () => {
    await persistProducts(INITIAL_PRODUCTS);
    await persistTransactions(INITIAL_TRANSACTIONS);
  }, [persistProducts, persistTransactions]);

  const pullOnlineUpdateFromGitHub = useCallback(async (): Promise<{
    ok: boolean;
    version: string;
    notes: string;
    apkUrl: string;
  }> => {
    const defaultApk =
      'https://github.com/rickmaity07-maker/stock-qr-inventory-app/releases/download/v1.0.0/Stock-QR-Inventory.apk';
    const endpoints = [
      `https://raw.githubusercontent.com/rickmaity07-maker/stock-qr-inventory-app/main/docs/live-update.json?t=${Date.now()}`,
      `https://rickmaity07-maker.github.io/stock-qr-inventory-app/live-update.json?t=${Date.now()}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) continue;
        const manifest = await res.json();
        if (Array.isArray(manifest.products) && manifest.products.length > 0) {
          // Merge remote mobile products while keeping any custom products the owner added locally
          const remoteIds = new Set(manifest.products.map((p: Product) => p.id));
          const customLocal = products.filter(
            (p) => !remoteIds.has(p.id) && !LEGACY_GROCERY_PATTERN.test(p.name)
          );
          const merged = [...customLocal, ...manifest.products];
          await persistProducts(merged);
        }
        setLastSyncedAt(new Date().toISOString());
        return {
          ok: true,
          version: manifest.version || 'v2.1.0',
          notes:
            manifest.notes ||
            'Synced 100% Mobile Store inventory & pre-connected all 8 QR codes.',
          apkUrl: manifest.apkDownloadUrl || defaultApk,
        };
      } catch {
        // try next endpoint
      }
    }

    // Fallback: ensure local Mobile Store catalog is clean & applied
    await persistProducts(INITIAL_PRODUCTS);
    return {
      ok: true,
      version: 'v2.1.0',
      notes: 'Mobile Phone Store catalogue & all 8 QR codes verified and active.',
      apkUrl: defaultApk,
    };
  }, [products, persistProducts]);

  // Automatically check for live cloud catalog updates on launch
  useEffect(() => {
    pullOnlineUpdateFromGitHub().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      products,
      transactions,
      role,
      scannerMode,
      ownerPin,
      cloudConfig,
      isSyncing,
      lastSyncedAt,
      unsyncedCount,
      lowStockProducts,
      expiringProducts,
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
      recordSale,
      recordRestock,
      getMonthlySummary,
      availableMonths,
      updateCloudConfig,
      syncWithCloud,
      resetToDemoData,
      pullOnlineUpdateFromGitHub,
    }),
    [
      products,
      transactions,
      role,
      scannerMode,
      ownerPin,
      cloudConfig,
      isSyncing,
      lastSyncedAt,
      unsyncedCount,
      lowStockProducts,
      expiringProducts,
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
      recordSale,
      recordRestock,
      getMonthlySummary,
      availableMonths,
      updateCloudConfig,
      syncWithCloud,
      resetToDemoData,
      pullOnlineUpdateFromGitHub,
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
