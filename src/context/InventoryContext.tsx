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
  PRODUCTS: '@stockqr_products_v1',
  TRANSACTIONS: '@stockqr_transactions_v1',
  ROLE: '@stockqr_role_v1',
  OWNER_PIN: '@stockqr_owner_pin_v1',
  CLOUD_CONFIG: '@stockqr_cloud_config_v1',
};

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

  // Load persisted offline-first state on launch
  useEffect(() => {
    (async () => {
      try {
        const [savedProducts, savedTx, savedRole, savedPin, savedCloud] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS),
          AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS),
          AsyncStorage.getItem(STORAGE_KEYS.ROLE),
          AsyncStorage.getItem(STORAGE_KEYS.OWNER_PIN),
          AsyncStorage.getItem(STORAGE_KEYS.CLOUD_CONFIG),
        ]);

        if (savedProducts) setProducts(JSON.parse(savedProducts));
        if (savedTx) setTransactions(JSON.parse(savedTx));
        if (savedRole === 'OWNER' || savedRole === 'STAFF') setRole(savedRole);
        if (savedPin) setOwnerPin(savedPin);
        if (savedCloud) setCloudConfig(JSON.parse(savedCloud));
      } catch (err) {
        console.warn('Failed to load offline inventory state:', err);
      }
    })();
  }, []);

  const persistProducts = useCallback(async (nextProducts: Product[]) => {
    setProducts(nextProducts);
    await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(nextProducts));
  }, []);

  const persistTransactions = useCallback(async (nextTx: StockTransaction[]) => {
    setTransactions(nextTx);
    await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(nextTx));
  }, []);

  // Cloud Sync Engine (Offline-first queue + Supabase Live Sync)
  const syncWithCloud = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    if (!client) {
      return {
        ok: false,
        message: 'Working offline locally. Add Supabase URL & Key in Settings to enable cloud sync.',
      };
    }

    setIsSyncing(true);
    try {
      // 1. Push any local unsynced products
      const unsyncedProds = products.filter((p) => !p.synced);
      if (unsyncedProds.length > 0) {
        const { error: prodUpsertErr } = await client
          .from('products')
          .upsert(unsyncedProds.map(mapProductToDbRow));
        if (prodUpsertErr) throw prodUpsertErr;
      }

      // 2. Push any local unsynced transactions
      const unsyncedTxs = transactions.filter((t) => !t.synced);
      if (unsyncedTxs.length > 0) {
        const { error: txUpsertErr } = await client
          .from('transactions')
          .upsert(unsyncedTxs.map(mapTransactionToDbRow));
        if (txUpsertErr) throw txUpsertErr;
      }

      // 3. Pull latest products & transactions from cloud
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
        // Seed remote DB with local products if remote table is empty
        await client.from('products').upsert(products.map(mapProductToDbRow));
        await persistProducts(products.map((p) => ({ ...p, synced: true })));
      }

      if (remoteTxs && remoteTxs.length > 0) {
        await persistTransactions(remoteTxs.map(mapDbRowToTransaction));
      } else if (transactions.length > 0) {
        await client.from('transactions').upsert(transactions.map(mapTransactionToDbRow));
        await persistTransactions(transactions.map((t) => ({ ...t, synced: true })));
      }

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setIsSyncing(false);
      return { ok: true, message: 'Synced live across all devices.' };
    } catch (err: any) {
      setIsSyncing(false);
      return {
        ok: false,
        message: err?.message || 'Offline — changes saved locally and will sync automatically.',
      };
    }
  }, [cloudConfig, products, transactions, persistProducts, persistTransactions]);

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

      if (cloudConfig.supabaseUrl && cloudConfig.autoSyncEnabled) {
        syncWithCloud();
      }
      return newProduct;
    },
    [products, persistProducts, cloudConfig, syncWithCloud]
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
      if (cloudConfig.supabaseUrl && cloudConfig.autoSyncEnabled) {
        syncWithCloud();
      }
    },
    [products, persistProducts, cloudConfig, syncWithCloud]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const next = products.filter((p) => p.id !== id);
      await persistProducts(next);
      const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
      if (client) {
        await client.from('products').delete().eq('id', id);
      }
    },
    [products, persistProducts, cloudConfig]
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
      return products.find(
        (p) =>
          p.qrCode.toUpperCase() === clean ||
          (p.factoryBarcode && p.factoryBarcode.trim().toUpperCase() === clean)
      );
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

      if (cloudConfig.supabaseUrl && cloudConfig.autoSyncEnabled) {
        syncWithCloud();
      }

      return {
        product: updatedProduct,
        lowStockTriggered: updatedQty <= updatedProduct.minStockLevel,
      };
    },
    [products, transactions, role, persistProducts, persistTransactions, cloudConfig, syncWithCloud]
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

      if (cloudConfig.supabaseUrl && cloudConfig.autoSyncEnabled) {
        syncWithCloud();
      }

      return updatedProduct;
    },
    [products, transactions, role, persistProducts, persistTransactions, cloudConfig, syncWithCloud]
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
