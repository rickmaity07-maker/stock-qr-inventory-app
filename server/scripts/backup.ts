/**
 * Saves a full, encrypted copy of the cloud data (run nightly by GitHub Actions):
 *   npm run backup -- <output file>
 * Needs DATABASE_URL and BACKUP_PASSPHRASE. The decrypted file is the app's normal
 * backup format, so it can be restored in the app (Settings → Data → Restore).
 */
import fs from 'node:fs';
import { neonDb } from '../src/db.js';
import { loadEnv } from '../src/env.js';
import { exportAll } from '../src/reports.js';
import { encryptBackup } from '../src/backupCrypto.js';

loadEnv();
const out = process.argv[2];
const { DATABASE_URL, BACKUP_PASSPHRASE } = process.env;
if (!out) throw new Error('Usage: npm run backup -- <output file>');
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!BACKUP_PASSPHRASE || BACKUP_PASSPHRASE.length < 16) throw new Error('BACKUP_PASSPHRASE (16+ characters) is not set');

const data = await exportAll(neonDb(DATABASE_URL));
fs.writeFileSync(out, encryptBackup(JSON.stringify(data, null, 1), BACKUP_PASSPHRASE));
console.log(`Backup saved: ${data.products.length} products, ${data.transactions.length} transactions → ${out}`);
