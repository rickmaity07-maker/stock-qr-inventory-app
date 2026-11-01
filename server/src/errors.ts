/** Crash / error reports: phones send them in small batches, the server logs its own. */
import { Db } from './db.js';

export interface ErrorReport {
  source: 'app' | 'server';
  message: string;
  stack?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  context?: string | null;
  at?: string | null;
}

const KEEP_DAYS = 90;
const MAX_ROWS = 2000;

export async function saveErrorReports(db: Db, reports: ErrorReport[]) {
  for (const r of reports) {
    await db.query(
      `insert into error_reports (source, message, stack, app_version, platform, context, at)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))`,
      [r.source, r.message.slice(0, 2000), r.stack?.slice(0, 8000) ?? null, r.appVersion ?? null, r.platform ?? null, r.context?.slice(0, 2000) ?? null, r.at ?? null]
    );
  }
  await db.query(`delete from error_reports where at < now() - interval '${KEEP_DAYS} days'`);
  await db.query(
    `delete from error_reports where id in (select id from error_reports order by id desc offset ${MAX_ROWS})`
  );
}

export async function listErrorReports(db: Db, limit = 50) {
  return db.query(
    `select id, at, source, message, stack, app_version as "appVersion", platform, context
     from error_reports order by id desc limit $1`,
    [limit]
  );
}
