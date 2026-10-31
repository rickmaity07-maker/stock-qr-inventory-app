/** Vercel entry point: every /api/* request is handled by the Hono app. */
import { handle } from '@hono/node-server/vercel';
import { createApp, configFromEnv } from '../src/app.js';
import { neonDb } from '../src/db.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const app = createApp(neonDb(process.env.DATABASE_URL), configFromEnv(process.env));

export const config = { api: { bodyParser: false } };
export default handle(app);
