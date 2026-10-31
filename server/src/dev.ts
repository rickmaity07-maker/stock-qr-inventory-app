/** Local development server: npm run dev → http://localhost:8787/api/health */
import { serve } from '@hono/node-server';
import { createApp, configFromEnv } from './app.js';
import { neonDb } from './db.js';
import { loadEnv } from './env.js';

loadEnv();
const app = createApp(neonDb(process.env.DATABASE_URL as string), configFromEnv(process.env));
serve({ fetch: app.fetch, port: 8787 }, (i) => console.log(`API on http://localhost:${i.port}/api`));
