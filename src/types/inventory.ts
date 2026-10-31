export type ScannerMode = 'SELL' | 'RESTOCK' | 'INFO';

export type UserRole = 'OWNER' | 'STAFF';

export interface Product {
  id: string;
  name: string;
  category: string;
  /** Automatically generated unique QR payload for this product (e.g., STK-IP16-4821) */
  qrCode: string;
  /** Optional linked factory barcode (EAN-13, UPC, Code128, etc.) */
  factoryBarcode?: string;
  buyingPrice: number;
  sellingPrice: number;
  /**
   * Current stock. Always derived: openingQuantity + restocks + adjustments - sales.
   * Kept on the record so screens, exports and the cloud table can read it directly.
   */
  quantity: number;
  /** Stock the product started with before any recorded transaction. */
  openingQuantity?: number;
  /** Minimum stock threshold for low-stock alerts & automatic reorder list */
  minStockLevel: number;
  /** Optional ISO date string (YYYY-MM-DD) for perishable goods */
  expiryDate?: string;
  /** Soft delete: hidden everywhere but kept so sales history and sync stay correct. */
  deleted?: boolean;
  updatedAt: string;
  synced?: boolean;
}

/** ADJUST is a manual stock correction (signed quantity) and never counts as revenue. */
export type TransactionType = 'SALE' | 'RESTOCK' | 'ADJUST';

export interface StockTransaction {
  id: string;
  productId: string;
  productName: string;
  type: TransactionType;
  /** Always positive for SALE / RESTOCK; signed for ADJUST. */
  quantity: number;
  /** Buying price saved at the moment of transaction so historical profit never changes */
  unitBuyingPrice: number;
  /** Selling price saved at the moment of transaction so historical revenue never changes */
  unitSellingPrice: number;
  performedByRole: UserRole;
  notes?: string;
  timestamp: string;
  synced?: boolean;
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
}

export interface MonthlySummary {
  monthKey: string; // e.g., "2026-10"
  monthLabel: string; // e.g., "October 2026"
  totalRevenue: number;
  totalCostOfGoods: number;
  grossProfit: number;
  profitMarginPercent: number;
  totalUnitsSold: number;
  totalUnitsRestocked: number;
  restockSpend: number;
  bestSellers: ProductPerformance[];
  worstSellers: ProductPerformance[];
  salesTransactions: StockTransaction[];
}

export interface CloudConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  autoSyncEnabled: boolean;
}

export interface InventoryState {
  products: Product[];
  transactions: StockTransaction[];
}
