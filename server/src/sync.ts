/**
 * Sync protocol: the phone sends what changed on it since its last sync, the server
 * stores it, then returns everything with a change number above the phone's cursor.
 *  - products: the newest edit (updatedAt) wins
 *  - transactions: insert once, never changed (a sale is a fact)
 */
import { Db } from './db';
import { productIn, ProductIn, transactionIn, TransactionIn } from './validation';

const PAGE = 2000;

export interface SyncResult {
  cursor: number;
  hasMore: boolean;
  products: ReturnType<typeof productOut>[];
  transactions: ReturnType<typeof transactionOut>[];
  rejected: { kind: 'product' | 'transaction'; id: string; reason: string }[];
}

export function productOut(r: Record<string, any>) {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as string,
    qrCode: r.qr_code as string,
    factoryBarcode: (r.factory_barcode as string | null) ?? undefined,
    buyingPrice: Number(r.buying_price),
    sellingPrice: Number(r.selling_price),
    quantity: Number(r.quantity),
    openingQuantity: r.opening_quantity === null || r.opening_quantity === undefined ? undefined : Number(r.opening_quantity),
    minStockLevel: Number(r.min_stock_level),
    expiryDate: r.expiry_date ? isoDay(r.expiry_date) : undefined,
    deleted: Boolean(r.deleted),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export function transactionOut(r: Record<string, any>) {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    productName: r.product_name as string,
    type: r.type as 'SALE' | 'RESTOCK' | 'ADJUST',
    quantity: Number(r.quantity),
    unitBuyingPrice: Number(r.unit_buying_price),
    unitSellingPrice: Number(r.unit_selling_price),
    performedByRole: (r.performed_by_role === 'STAFF' ? 'STAFF' : 'OWNER') as 'OWNER' | 'STAFF',
    notes: (r.notes as string | null) ?? undefined,
    timestamp: new Date(r.occurred_at).toISOString(),
  };
}

function isoDay(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

function validDate(s: string | null | undefined) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

export async function upsertProducts(db: Db, items: ProductIn[]) {
  if (!items.length) return;
  const rows = items.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    qr_code: p.qrCode,
    factory_barcode: p.factoryBarcode || null,
    buying_price: p.buyingPrice,
    selling_price: p.sellingPrice,
    quantity: p.quantity,
    opening_quantity: p.openingQuantity ?? null,
    min_stock_level: p.minStockLevel,
    expiry_date: validDate(p.expiryDate),
    deleted: Boolean(p.deleted),
    updated_at: new Date(p.updatedAt).toISOString(),
  }));
  await db.query(
    `insert into products (id, name, category, qr_code, factory_barcode, buying_price, selling_price,
       quantity, opening_quantity, min_stock_level, expiry_date, deleted, updated_at)
     select id, name, category, qr_code, factory_barcode, buying_price, selling_price,
       quantity, opening_quantity, min_stock_level, expiry_date, deleted, updated_at
     from jsonb_to_recordset($1::jsonb) as x(
       id text, name text, category text, qr_code text, factory_barcode text, buying_price numeric,
       selling_price numeric, quantity integer, opening_quantity integer, min_stock_level integer,
       expiry_date date, deleted boolean, updated_at timestamptz)
     on conflict (id) do update set
       name = excluded.name, category = excluded.category, qr_code = excluded.qr_code,
       factory_barcode = excluded.factory_barcode, buying_price = excluded.buying_price,
       selling_price = excluded.selling_price, quantity = excluded.quantity,
       opening_quantity = coalesce(excluded.opening_quantity, products.opening_quantity),
       min_stock_level = excluded.min_stock_level, expiry_date = excluded.expiry_date,
       deleted = excluded.deleted, updated_at = excluded.updated_at, seq = nextval('change_seq')
     where excluded.updated_at > products.updated_at`,
    [JSON.stringify(rows)]
  );
}

/** Inserts new transactions; ones whose product is unknown are returned as rejected. */
export async function insertTransactions(db: Db, items: TransactionIn[]) {
  if (!items.length) return [] as string[];
  const rows = items.map((t) => ({
    id: t.id,
    product_id: t.productId,
    product_name: t.productName,
    type: t.type,
    quantity: t.quantity,
    unit_buying_price: t.unitBuyingPrice,
    unit_selling_price: t.unitSellingPrice,
    performed_by_role: t.performedByRole,
    notes: t.notes || null,
    occurred_at: new Date(t.timestamp).toISOString(),
  }));
  const known = await db.query<{ id: string }>(
    `select x.id from jsonb_to_recordset($1::jsonb) as x(id text, product_id text)
     join products p on p.id = x.product_id`,
    [JSON.stringify(rows)]
  );
  const okIds = new Set(known.map((r) => r.id));
  const ok = rows.filter((r) => okIds.has(r.id));
  if (ok.length) {
    await db.query(
      `insert into transactions (id, product_id, product_name, type, quantity, unit_buying_price,
         unit_selling_price, performed_by_role, notes, occurred_at)
       select id, product_id, product_name, type, quantity, unit_buying_price, unit_selling_price,
         performed_by_role, notes, occurred_at
       from jsonb_to_recordset($1::jsonb) as x(
         id text, product_id text, product_name text, type text, quantity integer,
         unit_buying_price numeric, unit_selling_price numeric, performed_by_role text, notes text,
         occurred_at timestamptz)
       on conflict (id) do nothing`,
      [JSON.stringify(ok)]
    );
  }
  return rows.filter((r) => !okIds.has(r.id)).map((r) => r.id);
}

export async function sync(db: Db, body: { cursor: number; products: unknown[]; transactions: unknown[] }): Promise<SyncResult> {
  const rejected: SyncResult['rejected'] = [];

  const products: ProductIn[] = [];
  for (const raw of body.products) {
    const r = productIn.safeParse(raw);
    if (r.success) products.push(r.data);
    else rejected.push({ kind: 'product', id: String((raw as any)?.id ?? '?'), reason: r.error.issues[0]?.message ?? 'invalid' });
  }
  const transactions: TransactionIn[] = [];
  for (const raw of body.transactions) {
    const r = transactionIn.safeParse(raw);
    if (r.success) transactions.push(r.data);
    else rejected.push({ kind: 'transaction', id: String((raw as any)?.id ?? '?'), reason: r.error.issues[0]?.message ?? 'invalid' });
  }

  await upsertProducts(db, products);
  for (const id of await insertTransactions(db, transactions)) {
    rejected.push({ kind: 'transaction', id, reason: 'unknown product' });
  }

  const [prodRows, txRows] = await Promise.all([
    db.query(`select * from products where seq > $1 order by seq limit ${PAGE + 1}`, [body.cursor]),
    db.query(`select * from transactions where seq > $1 order by seq limit ${PAGE + 1}`, [body.cursor]),
  ]);
  const hasMore = prodRows.length > PAGE || txRows.length > PAGE;
  const p = prodRows.slice(0, PAGE);
  const t = txRows.slice(0, PAGE);
  // When paging, only advance to the lower of the two tables' last change so nothing is skipped.
  const lastP = p.length ? Number(p[p.length - 1].seq) : body.cursor;
  const lastT = t.length ? Number(t[t.length - 1].seq) : body.cursor;
  const cursor = hasMore
    ? Math.min(prodRows.length > PAGE ? lastP : Infinity, txRows.length > PAGE ? lastT : Infinity)
    : Math.max(lastP, lastT, body.cursor);

  return {
    cursor,
    hasMore,
    products: p.filter((r) => !hasMore || Number(r.seq) <= cursor).map(productOut),
    transactions: t.filter((r) => !hasMore || Number(r.seq) <= cursor).map(transactionOut),
    rejected,
  };
}
