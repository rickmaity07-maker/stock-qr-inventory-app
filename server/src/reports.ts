/** Read-only reports computed in SQL from the ledger. */
import { Db } from './db.js';
import { productOut } from './sync.js';

export async function listProducts(db: Db, includeDeleted = false) {
  const rows = await db.query(
    `select * from product_stock ${includeDeleted ? '' : 'where not deleted'} order by name`
  );
  return rows.map((r) => ({ ...productOut(r), quantity: Number(r.stock) }));
}

export async function getProduct(db: Db, id: string) {
  const rows = await db.query('select * from product_stock where id = $1', [id]);
  return rows[0] ? { ...productOut(rows[0]), quantity: Number(rows[0].stock) } : null;
}

/**
 * Monthly totals. `tz` is the shop's time zone so a sale at 00:30 local time
 * lands in the right month.
 */
export async function monthlyReport(db: Db, month: string, tz: string) {
  const [summary] = await db.query(
    `with m as (
       select * from transactions
       where to_char(occurred_at at time zone $2, 'YYYY-MM') = $1
     )
     select
       coalesce(sum(case when type = 'SALE' then quantity * unit_selling_price end), 0)::float8 as revenue,
       coalesce(sum(case when type = 'SALE' then quantity * unit_buying_price end), 0)::float8 as cost,
       coalesce(sum(case when type = 'SALE' then quantity end), 0)::int as units_sold,
       coalesce(sum(case when type = 'RESTOCK' then quantity end), 0)::int as units_restocked,
       coalesce(sum(case when type = 'RESTOCK' then quantity * unit_buying_price end), 0)::float8 as restock_spend
     from m`,
    [month, tz]
  );
  const products = await db.query(
    `select t.product_id, max(t.product_name) as product_name,
       sum(t.quantity)::int as units_sold,
       sum(t.quantity * t.unit_selling_price)::float8 as revenue,
       sum(t.quantity * (t.unit_selling_price - t.unit_buying_price))::float8 as profit
     from transactions t
     where t.type = 'SALE' and to_char(t.occurred_at at time zone $2, 'YYYY-MM') = $1
     group by t.product_id
     order by profit desc`,
    [month, tz]
  );
  const revenue = Number(summary.revenue);
  const cost = Number(summary.cost);
  return {
    month,
    timeZone: tz,
    revenue,
    costOfGoods: cost,
    grossProfit: revenue - cost,
    marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    unitsSold: Number(summary.units_sold),
    unitsRestocked: Number(summary.units_restocked),
    restockSpend: Number(summary.restock_spend),
    bestSellers: products.slice(0, 10).map((p) => ({
      productId: p.product_id,
      productName: p.product_name,
      unitsSold: Number(p.units_sold),
      revenue: Number(p.revenue),
      grossProfit: Number(p.profit),
    })),
  };
}

export async function stockReport(db: Db) {
  const rows = await db.query(
    `select id, name, stock, min_stock_level, buying_price::float8 as buying_price,
       selling_price::float8 as selling_price, expiry_date
     from product_stock where not deleted order by stock asc`
  );
  let costValue = 0;
  let retailValue = 0;
  for (const r of rows) {
    const q = Math.max(0, Number(r.stock));
    costValue += q * Number(r.buying_price);
    retailValue += q * Number(r.selling_price);
  }
  return {
    products: rows.length,
    units: rows.reduce((n, r) => n + Math.max(0, Number(r.stock)), 0),
    costValue,
    retailValue,
    lowStock: rows
      .filter((r) => Number(r.stock) <= Number(r.min_stock_level))
      .map((r) => ({ id: r.id, name: r.name, stock: Number(r.stock), minStockLevel: Number(r.min_stock_level) })),
  };
}

export async function listTransactions(db: Db, opts: { from?: string; to?: string; limit: number }) {
  const rows = await db.query(
    `select * from transactions
     where ($1::timestamptz is null or occurred_at >= $1::timestamptz)
       and ($2::timestamptz is null or occurred_at < $2::timestamptz)
     order by occurred_at desc limit $3`,
    [opts.from ?? null, opts.to ?? null, opts.limit]
  );
  const { transactionOut } = await import('./sync.js');
  return rows.map(transactionOut);
}

export async function exportAll(db: Db) {
  const [products, transactions] = await Promise.all([
    db.query('select * from products order by name'),
    db.query('select * from transactions order by occurred_at'),
  ]);
  const { transactionOut } = await import('./sync.js');
  return {
    format: 'stockqr-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: 'server',
    currency: 'GBP',
    products: products.map(productOut),
    transactions: transactions.map(transactionOut),
  };
}
