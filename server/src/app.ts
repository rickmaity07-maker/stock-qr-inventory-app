/**
 * Stock & QR Inventory API.
 *
 *   GET  /api/health
 *   GET  /api/auth/status               { hasOwner }
 *   POST /api/auth/setup                first-time owner account (needs SETUP_KEY)
 *   POST /api/auth/login                → { token, email }
 *   GET  /api/auth/me
 *   POST /api/auth/password             change password (signs out other devices)
 *   POST /api/auth/logout-all
 *   POST /api/sync                      push local changes, pull changes since cursor
 *   GET  /api/products[?deleted=1]      GET /api/products/:id
 *   GET  /api/transactions?from&to&limit
 *   GET  /api/reports/monthly?month=YYYY-MM&tz=Europe/Berlin
 *   GET  /api/reports/stock
 *   GET  /api/export                    full backup (same format as the app's backup file)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import { Db } from './db.js';
import {
  checkPassword,
  clearFailures,
  createOwner,
  getOwner,
  issueToken,
  OwnerRow,
  recordFailure,
  safeEqual,
  setPassword,
  tooManyAttempts,
  verifyToken,
} from './auth.js';
import { credentials, passwordChangeIn, setupIn, syncIn } from './validation.js';
import { sync } from './sync.js';
import { exportAll, getProduct, listProducts, listTransactions, monthlyReport, stockReport } from './reports.js';

export interface AppConfig {
  jwtSecret: string;
  setupKey?: string;
  allowedOrigins: string[];
}

type Env = { Variables: { owner: OwnerRow } };

export function createApp(db: Db, config: AppConfig) {
  if (!config.jwtSecret || config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

  const app = new Hono<Env>().basePath('/api');

  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 600,
    })
  );
  app.use('*', bodyLimit({ maxSize: 8 * 1024 * 1024 }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? 'Invalid request' }, 400);
    if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON' }, 400);
    console.error(err);
    return c.json({ error: 'Server error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  const clientKey = (c: { req: { header: (n: string) => string | undefined } }) =>
    `ip:${(c.req.header('x-forwarded-for') || 'local').split(',')[0].trim()}`;

  // ---- public ------------------------------------------------------------------

  app.get('/health', async (c) => {
    await db.query('select 1');
    return c.json({ ok: true, time: new Date().toISOString() });
  });

  app.get('/auth/status', async (c) => c.json({ hasOwner: Boolean(await getOwner(db)) }));

  app.post('/auth/setup', async (c) => {
    const body = setupIn.parse(await c.req.json());
    const key = clientKey(c);
    if (await tooManyAttempts(db, key)) throw new HTTPException(429, { message: 'Too many attempts. Try again in 15 minutes.' });
    if (!config.setupKey || !safeEqual(body.setupKey.trim().toUpperCase(), config.setupKey.toUpperCase())) {
      await recordFailure(db, key);
      throw new HTTPException(403, { message: 'Wrong setup key.' });
    }
    if (!(await createOwner(db, body.email, body.password))) {
      throw new HTTPException(409, { message: 'An owner account already exists. Sign in instead.' });
    }
    const owner = (await getOwner(db)) as OwnerRow;
    return c.json({ token: await issueToken(config.jwtSecret, owner.token_version), email: owner.email }, 201);
  });

  app.post('/auth/login', async (c) => {
    const body = credentials.parse(await c.req.json());
    const key = clientKey(c);
    if (await tooManyAttempts(db, key)) throw new HTTPException(429, { message: 'Too many attempts. Try again in 15 minutes.' });
    const owner = await getOwner(db);
    if (!owner || owner.email !== body.email || !(await checkPassword(owner, body.password))) {
      await recordFailure(db, key);
      throw new HTTPException(401, { message: 'Email or password is wrong.' });
    }
    await clearFailures(db, key);
    return c.json({ token: await issueToken(config.jwtSecret, owner.token_version), email: owner.email });
  });

  // ---- signed in -------------------------------------------------------------

  const requireOwner = async (c: any, next: () => Promise<void>) => {
    const header = c.req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const owner = token ? await verifyToken(db, config.jwtSecret, token) : null;
    if (!owner) throw new HTTPException(401, { message: 'Please sign in again.' });
    c.set('owner', owner);
    await next();
  };

  app.use('/auth/me', requireOwner);
  app.use('/auth/password', requireOwner);
  app.use('/auth/logout-all', requireOwner);
  app.use('/sync', requireOwner);
  app.use('/products', requireOwner);
  app.use('/products/*', requireOwner);
  app.use('/transactions', requireOwner);
  app.use('/reports/*', requireOwner);
  app.use('/export', requireOwner);

  app.get('/auth/me', (c) => c.json({ email: c.get('owner').email }));

  app.post('/auth/password', async (c) => {
    const body = passwordChangeIn.parse(await c.req.json());
    const owner = c.get('owner');
    if (!(await checkPassword(owner, body.currentPassword))) throw new HTTPException(403, { message: 'Current password is wrong.' });
    await setPassword(db, owner.email, body.newPassword);
    const updated = (await getOwner(db)) as OwnerRow;
    return c.json({ token: await issueToken(config.jwtSecret, updated.token_version) });
  });

  app.post('/auth/logout-all', async (c) => {
    await db.query('update owner_account set token_version = token_version + 1, updated_at = now() where id = 1');
    return c.json({ ok: true });
  });

  app.post('/sync', async (c) => {
    const body = syncIn.parse(await c.req.json());
    return c.json(await sync(db, body));
  });

  app.get('/products', async (c) => c.json(await listProducts(db, c.req.query('deleted') === '1')));

  app.get('/products/:id', async (c) => {
    const p = await getProduct(db, c.req.param('id'));
    if (!p) throw new HTTPException(404, { message: 'Product not found' });
    return c.json(p);
  });

  app.get('/transactions', async (c) => {
    const limit = Math.min(5000, Math.max(1, Number(c.req.query('limit') || 500)));
    const from = c.req.query('from');
    const to = c.req.query('to');
    for (const d of [from, to]) {
      if (d && Number.isNaN(Date.parse(d))) throw new HTTPException(400, { message: 'from/to must be dates' });
    }
    return c.json(await listTransactions(db, { from, to, limit }));
  });

  app.get('/reports/monthly', async (c) => {
    const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HTTPException(400, { message: 'month must be YYYY-MM' });
    const tz = c.req.query('tz') || 'Europe/Berlin';
    if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(tz)) throw new HTTPException(400, { message: 'Invalid time zone' });
    const known = await db.query('select 1 from pg_timezone_names where name = $1 limit 1', [tz]);
    if (!known.length) throw new HTTPException(400, { message: 'Unknown time zone' });
    return c.json(await monthlyReport(db, month, tz));
  });

  app.get('/reports/stock', async (c) => c.json(await stockReport(db)));

  app.get('/export', async (c) => {
    c.header('Content-Disposition', `attachment; filename="StockQR-server-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(await exportAll(db));
  });

  return app;
}

export function configFromEnv(env: Record<string, string | undefined>): AppConfig {
  return {
    jwtSecret: env.JWT_SECRET || '',
    setupKey: env.SETUP_KEY,
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://rickmaity07-maker.github.io,http://127.0.0.1:4180,http://localhost:8081')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
