/** Shows the latest crash / error reports:  npm run errors [-- 50] */
import { neonDb } from '../src/db.js';
import { loadEnv } from '../src/env.js';
import { listErrorReports } from '../src/errors.js';

loadEnv();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (server/.env)');
const rows = await listErrorReports(neonDb(process.env.DATABASE_URL), Number(process.argv[2] || 30));
if (!rows.length) console.log('No error reports. 🎉');
for (const r of rows.reverse() as any[]) {
  console.log(`\n#${r.id} ${new Date(r.at).toISOString()} [${r.source}${r.platform ? ' ' + r.platform : ''}${r.appVersion ? ' v' + r.appVersion : ''}] ${r.message}`);
  if (r.context) console.log(`  where: ${r.context}`);
  if (r.stack) console.log(r.stack.split('\n').slice(0, 6).map((l: string) => '  ' + l.trim()).join('\n'));
}
