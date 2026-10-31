/**
 * Minimal database interface so the API runs on Neon in production and on an
 * in-process Postgres (PGlite) in tests.
 */
import { neon } from '@neondatabase/serverless';

export interface Db {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[];
    },
  };
}
