/**
 * Pure inventory rules. No React, no storage, no network — so they can be unit tested
 * and shared by the phone app, the iPhone web app and the sync engine.
 */
import {
  InventoryState,
  MonthlySummary,
  Product,
  ProductPerformance,
  StockTransaction,
} from '../types/inventory';

// ---------------------------------------------------------------------------
// Stock maths
// ---------------------------------------------------------------------------

/** How much a transaction changes stock. */
export function txDelta(tx: Pick<StockTransaction, 'type' | 'quantity'>): number {
  const qty = Number(tx.quantity) || 0;
  if (tx.type === 'SALE') return -Math.abs(qty);
  if (tx.type === 'RESTOCK') return Math.abs(qty);
  return qty; // ADJUST is signed
}

function netDeltaByProduct(transactions: StockTransaction[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const tx of transactions) {
    net.set(tx.productId, (net.get(tx.productId) || 0) + txDelta(tx));
  }
  return net;
}

/**
 * Gives every product an openingQuantity so that opening + transactions equals the
 * quantity it shows today. Products saved by older versions of the app lack it.
 */
export function ensureOpeningQuantities(
  products: Product[],
  transactions: StockTransaction[]
): Product[] {
  const net = netDeltaByProduct(transactions);
  return products.map((p) =>
    typeof p.openingQuantity === 'number' && Number.isFinite(p.openingQuantity)
      ? p
      : { ...p, openingQuantity: (Number(p.quantity) || 0) - (net.get(p.id) || 0) }
  );
}

/** Recomputes every product's quantity from its opening stock plus all transactions. */
export function recomputeQuantities(
  products: Product[],
  transactions: StockTransaction[]
): Product[] {
  const net = netDeltaByProduct(transactions);
  return products.map((p) => {
    const quantity = (p.openingQuantity ?? 0) + (net.get(p.id) || 0);
    return quantity === p.quantity ? p : { ...p, quantity };
  });
}

/** Normalises any loaded or received state into a consistent one. */
export function normalizeState(state: InventoryState): InventoryState {
  const transactions = dedupeTransactions(state.transactions.filter(isValidTransaction));
  const products = recomputeQuantities(
    ensureOpeningQuantities(state.products.filter(isValidProduct), transactions),
    transactions
  );
  return { products, transactions: sortTransactions(transactions) };
}

export function activeProducts(products: Product[]): Product[] {
  return products.filter((p) => !p.deleted);
}

export function isLowStock(p: Product): boolean {
  return p.quantity <= p.minStockLevel;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidProduct(p: unknown): p is Product {
  const x = p as Product;
  return Boolean(
    x &&
      typeof x.id === 'string' &&
      x.id.length > 0 &&
      typeof x.name === 'string' &&
      typeof x.qrCode === 'string'
  );
}

export function isValidTransaction(t: unknown): t is StockTransaction {
  const x = t as StockTransaction;
  return Boolean(
    x &&
      typeof x.id === 'string' &&
      typeof x.productId === 'string' &&
      (x.type === 'SALE' || x.type === 'RESTOCK' || x.type === 'ADJUST') &&
      Number.isFinite(Number(x.quantity)) &&
      typeof x.timestamp === 'string'
  );
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Parses a money/number field. Returns null when it is empty or not a valid non-negative number. */
export function parseNonNegativeNumber(value: string): number | null {
  const clean = value.replace(',', '.').trim();
  if (!clean || !/^\d*\.?\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parses a whole-number field (stock counts). */
export function parseWholeNumber(value: string): number | null {
  const clean = value.trim();
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isSafeInteger(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

const QR_PATTERN = /STK-[A-Z0-9]{4}-[A-Z0-9]{4,}/;

/**
 * Finds the product a scanned code belongs to. Only exact matches count —
 * a factory barcode that merely contains digits of a QR code must never match.
 */
export function findProductByCode(products: Product[], scannedCode: string): Product | undefined {
  const clean = scannedCode.trim().toUpperCase();
  if (!clean) return undefined;
  const live = activeProducts(products);

  const exact = live.find(
    (p) =>
      p.qrCode.toUpperCase() === clean ||
      (p.factoryBarcode && p.factoryBarcode.trim().toUpperCase() === clean)
  );
  if (exact) return exact;

  // A QR code embedded in a longer payload (e.g. a URL printed on a label)
  const embedded = clean.match(QR_PATTERN)?.[0];
  if (embedded) {
    return live.find((p) => p.qrCode.toUpperCase() === embedded);
  }
  return undefined;
}

/** Creates a QR payload such as STK-IPHO-7Q2K that no other product uses. */
export function generateUniqueQrCode(
  name: string,
  existingCodes: Iterable<string>,
  random: () => number = Math.random
): string {
  const taken = new Set(Array.from(existingCodes, (c) => c.toUpperCase()));
  const prefix = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 500; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 4; i += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
    const code = `STK-${prefix}-${suffix}`;
    if (!taken.has(code)) return code;
  }
  // Practically unreachable; fall back to a longer suffix.
  return `STK-${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function newId(prefix: string, random: () => number = Math.random): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Sync merging
// ---------------------------------------------------------------------------

function dedupeTransactions(list: StockTransaction[]): StockTransaction[] {
  const byId = new Map<string, StockTransaction>();
  for (const tx of list) if (!byId.has(tx.id)) byId.set(tx.id, tx);
  return Array.from(byId.values());
}

export function sortTransactions(list: StockTransaction[]): StockTransaction[] {
  return [...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Merges another device's state into ours. Converges no matter the order packets arrive in:
 * - transactions: union by id (a sale recorded on either phone is never lost)
 * - product details: the most recently updated version wins
 * - stock: recomputed from transactions, so two phones selling at once both count
 *
 * Records that came from `remote` are marked synced; local records keep their flag.
 */
export function mergeStates(local: InventoryState, remote: InventoryState): InventoryState {
  const remoteNorm = {
    products: ensureOpeningQuantities(
      remote.products.filter(isValidProduct),
      remote.transactions.filter(isValidTransaction)
    ),
    transactions: remote.transactions.filter(isValidTransaction),
  };

  const productById = new Map<string, Product>();
  for (const p of local.products) productById.set(p.id, p);
  for (const rp of remoteNorm.products) {
    const lp = productById.get(rp.id);
    if (!lp || rp.updatedAt > lp.updatedAt) {
      productById.set(rp.id, { ...rp, synced: true });
    }
  }

  const txById = new Map<string, StockTransaction>();
  for (const t of local.transactions) txById.set(t.id, t);
  for (const rt of remoteNorm.transactions) {
    if (!txById.has(rt.id)) txById.set(rt.id, { ...rt, synced: true });
  }

  const transactions = sortTransactions(Array.from(txById.values()));
  const products = recomputeQuantities(Array.from(productById.values()), transactions);
  return { products, transactions };
}

/** Same state content (ignores sync flags and ordering)? Used to skip pointless writes. */
export function sameContent(a: InventoryState, b: InventoryState): boolean {
  if (a.products.length !== b.products.length || a.transactions.length !== b.transactions.length) {
    return false;
  }
  const pa = new Map(a.products.map((p) => [p.id, `${p.updatedAt}|${p.quantity}|${p.deleted ? 1 : 0}`]));
  for (const p of b.products) {
    if (pa.get(p.id) !== `${p.updatedAt}|${p.quantity}|${p.deleted ? 1 : 0}`) return false;
  }
  const ta = new Set(a.transactions.map((t) => t.id));
  return b.transactions.every((t) => ta.has(t.id));
}

// ---------------------------------------------------------------------------
// Months & reports
// ---------------------------------------------------------------------------

/** Month key (YYYY-MM) in the phone's own time zone, so a sale at 00:30 lands in the right month. */
export function localMonthKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [yr, mo] = key.split('-').map(Number);
  if (!yr || !mo) return key;
  return new Date(yr, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function availableMonths(
  transactions: StockTransaction[],
  now: Date = new Date()
): { key: string; label: string }[] {
  const keys = new Set<string>([localMonthKey(now)]);
  for (const tx of transactions) {
    const key = localMonthKey(tx.timestamp);
    if (key) keys.add(key);
  }
  return Array.from(keys)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));
}

export function buildMonthlySummary(
  products: Product[],
  transactions: StockTransaction[],
  monthKey: string
): MonthlySummary {
  const monthTxs = transactions.filter((t) => localMonthKey(t.timestamp) === monthKey);
  const salesTransactions = monthTxs.filter((t) => t.type === 'SALE');
  const restockTransactions = monthTxs.filter((t) => t.type === 'RESTOCK');

  let totalRevenue = 0;
  let totalCostOfGoods = 0;
  let totalUnitsSold = 0;
  const perfMap = new Map<string, ProductPerformance>();

  for (const p of activeProducts(products)) {
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
    existing.grossProfit += rev - cost;
    perfMap.set(tx.productId, existing);
  }

  let totalUnitsRestocked = 0;
  let restockSpend = 0;
  for (const rtx of restockTransactions) {
    totalUnitsRestocked += rtx.quantity;
    restockSpend += rtx.quantity * rtx.unitBuyingPrice;
  }

  const grossProfit = totalRevenue - totalCostOfGoods;
  const allPerf = Array.from(perfMap.values());
  const liveIds = new Set(activeProducts(products).map((p) => p.id));

  return {
    monthKey,
    monthLabel: monthLabel(monthKey),
    totalRevenue,
    totalCostOfGoods,
    grossProfit,
    profitMarginPercent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    totalUnitsSold,
    totalUnitsRestocked,
    restockSpend,
    bestSellers: allPerf.filter((i) => i.unitsSold > 0).sort((a, b) => b.grossProfit - a.grossProfit),
    worstSellers: allPerf.filter((i) => liveIds.has(i.productId)).sort((a, b) => a.unitsSold - b.unitsSold),
    salesTransactions,
  };
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/** Whole days from today until the expiry date (negative = already expired). */
export function daysUntil(isoDate: string, now: Date = new Date()): number | null {
  if (!isValidIsoDate(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

// ---------------------------------------------------------------------------
// CSV (safe for Excel)
// ---------------------------------------------------------------------------

/** Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Versions & pairing codes
// ---------------------------------------------------------------------------

/** >0 when a is newer than b. Accepts "v2.4.0" or "2.4". */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const PAIRING_PREFIX = 'STOCKQR-SYNC:';
const SYNC_CODE_PATTERN = /^[a-z0-9]{20,64}$/;

export function buildPairingPayload(syncCode: string): string {
  return `${PAIRING_PREFIX}${syncCode}`;
}

/** Returns the store sync code inside a scanned pairing QR (or a typed code), else null. */
export function parsePairingPayload(text: string): string | null {
  const trimmed = text.trim();
  const raw = trimmed.toUpperCase().startsWith(PAIRING_PREFIX)
    ? trimmed.slice(PAIRING_PREFIX.length)
    : trimmed;
  const code = raw.trim().toLowerCase();
  return SYNC_CODE_PATTERN.test(code) ? code : null;
}

/** Turns random bytes into a store sync code (lowercase base36, ~128 bits). */
export function syncCodeFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}
