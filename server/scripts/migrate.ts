/** Applies db/schema.sql to the database in DATABASE_URL (safe to re-run). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neonDb } from '../src/db';
import { loadEnv } from '../src/env';
import { splitSql } from '../src/sqlSplit';

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (server/.env)');
const db = neonDb(url);
const schema = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql'), 'utf8');
for (const stmt of splitSql(schema)) await db.query(stmt);
const tables = await db.query<{ table_name: string }>(
  "select table_name from information_schema.tables where table_schema = 'public' order by 1"
);
console.log('Schema applied. Tables/views:', tables.map((t) => t.table_name).join(', '));
