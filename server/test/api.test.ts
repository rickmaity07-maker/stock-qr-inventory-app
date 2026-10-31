import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { Db } from '../src/db.js';
import { splitSql } from '../src/sqlSplit.js';

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const SECRET = 'test-secret-that-is-definitely-long-enough-123';
const SETUP_KEY = 'ABCD-1234';
const ORIGIN = 'https://rickmaity07-maker.github.io';

let app: ReturnType<typeof createApp>;
let db: Db;

async function freshDb(): Promise<Db> {
  const pg = new PGlite();
  for (const stmt of splitSql(SCHEMA)) await pg.exec(stmt);
  return { query: async (text, params = []) => (await pg.query(text, params as any[])).rows as any[] };
}

async function call(method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await app.request(`/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function setupOwner() {
  const r = await call('POST', '/auth/setup', { setupKey: SETUP_KEY, email: 'owner@shop.test', password: 'correct horse 1' });
  expect(r.status).toBe(201);
  return r.body.token as string;
}

const product = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Product ${id}`,
  category: 'Phones',
  qrCode: `STK-${id.toUpperCase().padEnd(4, 'X').slice(0, 4)}-0001`,
  buyingPrice: 10,
  sellingPrice: 25,
  quantity: 10,
  openingQuantity: 10,
  minStockLevel: 3,
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

const sale = (id: string, productId: string, qty: number, ts = '2026-10-15T12:00:00.000Z') => ({
  id,
  productId,
  productName: `Product ${productId}`,
  type: 'SALE',
  quantity: qty,
  unitBuyingPrice: 10,
  unitSellingPrice: 25,
  performedByRole: 'OWNER',
  timestamp: ts,
});

beforeEach(async () => {
  db = await freshDb();
  app = createApp(db, { jwtSecret: SECRET, setupKey: SETUP_KEY, allowedOrigins: [ORIGIN] });
});

describe('health & config', () => {
  it('reports healthy', async () => {
    const r = await call('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('refuses a short JWT secret', () => {
    expect(() => createApp(db, { jwtSecret: 'short', allowedOrigins: [] })).toThrow();
  });

  it('unknown routes return JSON 404', async () => {
    const r = await call('GET', '/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Not found');
  });

  it('allows the GitHub Pages origin and no other', async () => {
    const ok = await call('GET', '/health', undefined, undefined, { Origin: ORIGIN });
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await call('GET', '/health', undefined, undefined, { Origin: 'https://evil.example' });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('owner account', () => {
  it('setup needs the right key, works once, then sign-in works', async () => {
    expect((await call('GET', '/auth/status')).body.hasOwner).toBe(false);
    const wrong = await call('POST', '/auth/setup', { setupKey: 'NOPE', email: 'a@b.test', password: 'password123' });
    expect(wrong.status).toBe(403);
    await setupOwner();
    expect((await call('GET', '/auth/status')).body.hasOwner).toBe(true);
    const again = await call('POST', '/auth/setup', { setupKey: SETUP_KEY, email: 'x@y.test', password: 'password123' });
    expect(again.status).toBe(409);
    const login = await call('POST', '/auth/login', { email: 'OWNER@shop.test', password: 'correct horse 1' });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
  });

  it('setup key is case-insensitive', async () => {
    const r = await call('POST', '/auth/setup', { setupKey: 'abcd-1234', email: 'o@s.test', password: 'password123' });
    expect(r.status).toBe(201);
  });

  it('rejects short passwords and bad emails', async () => {
    expect((await call('POST', '/auth/setup', { setupKey: SETUP_KEY, email: 'o@s.test', password: 'short' })).status).toBe(400);
    expect((await call('POST', '/auth/setup', { setupKey: SETUP_KEY, email: 'not-an-email', password: 'password123' })).status).toBe(400);
  });

  it('wrong password is rejected and repeated failures are rate limited', async () => {
    await setupOwner();
    for (let i = 0; i < 8; i++) {
      expect((await call('POST', '/auth/login', { email: 'owner@shop.test', password: 'wrong password' })).status).toBe(401);
    }
    const blocked = await call('POST', '/auth/login', { email: 'owner@shop.test', password: 'correct horse 1' });
    expect(blocked.status).toBe(429);
  });

  it('password is stored hashed', async () => {
    await setupOwner();
    const [row] = await db.query<{ password_hash: string }>('select password_hash from owner_account');
    expect(row.password_hash).not.toContain('correct horse');
    expect(row.password_hash.startsWith('$2')).toBe(true);
  });

  it('protected routes need a valid token', async () => {
    await setupOwner();
    expect((await call('POST', '/sync', {})).status).toBe(401);
    expect((await call('GET', '/products', undefined, 'garbage')).status).toBe(401);
    expect((await call('GET', '/export', undefined, 'a.b.c')).status).toBe(401);
  });

  it('changing the password signs out old tokens and returns a new one', async () => {
    const token = await setupOwner();
    const wrong = await call('POST', '/auth/password', { currentPassword: 'nope', newPassword: 'another pass 2' }, token);
    expect(wrong.status).toBe(403);
    const r = await call('POST', '/auth/password', { currentPassword: 'correct horse 1', newPassword: 'another pass 2' }, token);
    expect(r.status).toBe(200);
    expect((await call('GET', '/auth/me', undefined, token)).status).toBe(401);
    expect((await call('GET', '/auth/me', undefined, r.body.token)).body.email).toBe('owner@shop.test');
    expect((await call('POST', '/auth/login', { email: 'owner@shop.test', password: 'another pass 2' })).status).toBe(200);
  });

  it('sign out everywhere revokes tokens', async () => {
    const token = await setupOwner();
    expect((await call('POST', '/auth/logout-all', {}, token)).status).toBe(200);
    expect((await call('GET', '/auth/me', undefined, token)).status).toBe(401);
  });
});

describe('sync', () => {
  it('pushes products and sales and pulls them back with a cursor', async () => {
    const token = await setupOwner();
    const first = await call('POST', '/sync', { cursor: 0, products: [product('p1'), product('p2')], transactions: [sale('t1', 'p1', 2)] }, token);
    expect(first.status).toBe(200);
    expect(first.body.products).toHaveLength(2);
    expect(first.body.transactions).toHaveLength(1);
    expect(first.body.rejected).toEqual([]);
    expect(first.body.cursor).toBeGreaterThan(0);

    const nothing = await call('POST', '/sync', { cursor: first.body.cursor }, token);
    expect(nothing.body.products).toHaveLength(0);
    expect(nothing.body.transactions).toHaveLength(0);
    expect(nothing.body.cursor).toBe(first.body.cursor);
  });

  it('a second phone receives the first phone\'s changes', async () => {
    const token = await setupOwner();
    const a = await call('POST', '/sync', { cursor: 0, products: [product('p1')] }, token);
    await call('POST', '/sync', { cursor: a.body.cursor, transactions: [sale('t-a', 'p1', 1)] }, token);
    const b = await call('POST', '/sync', { cursor: 0, transactions: [sale('t-b', 'p1', 2)] }, token);
    expect(b.body.products.map((p: any) => p.id)).toEqual(['p1']);
    expect(b.body.transactions.map((t: any) => t.id).sort()).toEqual(['t-a', 't-b']);
    const stock = await call('GET', '/products/p1', undefined, token);
    expect(stock.body.quantity).toBe(7); // 10 - 1 - 2
  });

  it('newest product edit wins; an older edit arriving later is ignored', async () => {
    const token = await setupOwner();
    await call('POST', '/sync', { products: [product('p1', { name: 'New name', updatedAt: '2026-10-05T00:00:00.000Z' })] }, token);
    await call('POST', '/sync', { products: [product('p1', { name: 'Old name', updatedAt: '2026-10-01T00:00:00.000Z' })] }, token);
    expect((await call('GET', '/products/p1', undefined, token)).body.name).toBe('New name');
  });

  it('a sale sent twice is stored once', async () => {
    const token = await setupOwner();
    await call('POST', '/sync', { products: [product('p1')], transactions: [sale('t1', 'p1', 1)] }, token);
    await call('POST', '/sync', { transactions: [sale('t1', 'p1', 1)] }, token);
    const [n] = await db.query<{ c: number }>('select count(*)::int as c from transactions');
    expect(n.c).toBe(1);
  });

  it('rejects invalid records individually and keeps the valid ones', async () => {
    const token = await setupOwner();
    const r = await call(
      'POST',
      '/sync',
      {
        products: [product('p1'), { id: 'bad', name: '' }],
        transactions: [sale('t-ok', 'p1', 1), sale('t-unknown', 'ghost', 1), { ...sale('t-neg', 'p1', 1), quantity: -3 }],
      },
      token
    );
    expect(r.status).toBe(200);
    const reasons = Object.fromEntries(r.body.rejected.map((x: any) => [x.id, x.reason]));
    expect(Object.keys(reasons).sort()).toEqual(['bad', 't-neg', 't-unknown']);
    expect(reasons['t-unknown']).toBe('unknown product');
    expect(r.body.transactions.map((t: any) => t.id)).toEqual(['t-ok']);
  });

  it('stock corrections (ADJUST) can be negative', async () => {
    const token = await setupOwner();
    const adj = { ...sale('adj1', 'p1', 0), type: 'ADJUST', quantity: -4 };
    const r = await call('POST', '/sync', { products: [product('p1')], transactions: [adj] }, token);
    expect(r.body.rejected).toEqual([]);
    expect((await call('GET', '/products/p1', undefined, token)).body.quantity).toBe(6);
  });

  it('soft-deleted products leave the product list but keep their sales', async () => {
    const token = await setupOwner();
    await call('POST', '/sync', { products: [product('p1')], transactions: [sale('t1', 'p1', 2)] }, token);
    await call('POST', '/sync', { products: [product('p1', { deleted: true, updatedAt: '2026-10-20T00:00:00.000Z' })] }, token);
    expect((await call('GET', '/products', undefined, token)).body).toHaveLength(0);
    expect((await call('GET', '/products?deleted=1', undefined, token)).body).toHaveLength(1);
    expect((await call('GET', '/reports/monthly?month=2026-10', undefined, token)).body.unitsSold).toBe(2);
  });

  it('keeps expiry dates as plain days and drops impossible ones', async () => {
    const token = await setupOwner();
    const r = await call('POST', '/sync', { products: [product('p1', { expiryDate: '2027-06-30' }), product('p2', { expiryDate: '2027-02-30' })] }, token);
    const byId = Object.fromEntries(r.body.products.map((p: any) => [p.id, p]));
    expect(byId.p1.expiryDate).toBe('2027-06-30');
    expect(byId.p2.expiryDate).toBeUndefined();
  });

  it('pages large pulls without skipping anything', async () => {
    const token = await setupOwner();
    const many = Array.from({ length: 2105 }, (_, i) => product(`p${i}`));
    await call('POST', '/sync', { products: many }, token);
    let cursor = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/sync', { cursor }, token);
      r.body.products.forEach((p: any) => seen.add(p.id));
      cursor = r.body.cursor;
      if (!r.body.hasMore) break;
    }
    expect(seen.size).toBe(2105);
  });
});

describe('reports & export', () => {
  it('monthly report totals sales only, by the shop\'s time zone', async () => {
    const token = await setupOwner();
    await call(
      'POST',
      '/sync',
      {
        products: [product('p1')],
        transactions: [
          sale('t1', 'p1', 2, '2026-10-10T12:00:00.000Z'),
          sale('t2', 'p1', 1, '2026-10-31T23:30:00.000Z'), // 00:30 on 1 Nov in Berlin
          { ...sale('r1', 'p1', 5, '2026-10-11T09:00:00.000Z'), type: 'RESTOCK' },
        ],
      },
      token
    );
    const oct = (await call('GET', '/reports/monthly?month=2026-10&tz=Europe/Berlin', undefined, token)).body;
    expect(oct.unitsSold).toBe(2);
    expect(oct.revenue).toBe(50);
    expect(oct.costOfGoods).toBe(20);
    expect(oct.grossProfit).toBe(30);
    expect(oct.marginPercent).toBeCloseTo(60);
    expect(oct.unitsRestocked).toBe(5);
    expect(oct.restockSpend).toBe(50);
    expect(oct.bestSellers[0]).toMatchObject({ productId: 'p1', unitsSold: 2 });
    const nov = (await call('GET', '/reports/monthly?month=2026-11&tz=Europe/Berlin', undefined, token)).body;
    expect(nov.unitsSold).toBe(1);
  });

  it('validates report parameters', async () => {
    const token = await setupOwner();
    expect((await call('GET', '/reports/monthly?month=2026-13', undefined, token)).status).toBe(400);
    expect((await call('GET', '/reports/monthly?month=2026-10&tz=Not/AZone', undefined, token)).status).toBe(400);
    expect((await call('GET', '/transactions?from=yesterday', undefined, token)).status).toBe(400);
  });

  it('stock report lists low stock and values stock', async () => {
    const token = await setupOwner();
    await call('POST', '/sync', { products: [product('p1'), product('p2', { minStockLevel: 9 })], transactions: [sale('t1', 'p2', 2)] }, token);
    const r = (await call('GET', '/reports/stock', undefined, token)).body;
    expect(r.products).toBe(2);
    expect(r.units).toBe(18);
    expect(r.costValue).toBe(180);
    expect(r.retailValue).toBe(450);
    expect(r.lowStock).toEqual([{ id: 'p2', name: 'Product p2', stock: 8, minStockLevel: 9 }]);
  });

  it('lists transactions newest first within a date range', async () => {
    const token = await setupOwner();
    await call(
      'POST',
      '/sync',
      { products: [product('p1')], transactions: [sale('a', 'p1', 1, '2026-09-01T10:00:00Z'), sale('b', 'p1', 1, '2026-10-01T10:00:00Z')] },
      token
    );
    const all = (await call('GET', '/transactions', undefined, token)).body;
    expect(all.map((t: any) => t.id)).toEqual(['b', 'a']);
    const oct = (await call('GET', '/transactions?from=2026-10-01&to=2026-11-01', undefined, token)).body;
    expect(oct.map((t: any) => t.id)).toEqual(['b']);
  });

  it('export matches the app backup format', async () => {
    const token = await setupOwner();
    await call('POST', '/sync', { products: [product('p1')], transactions: [sale('t1', 'p1', 1)] }, token);
    const r = await call('GET', '/export', undefined, token);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(r.body.format).toBe('stockqr-backup');
    expect(r.body.products).toHaveLength(1);
    expect(r.body.transactions).toHaveLength(1);
  });
});
