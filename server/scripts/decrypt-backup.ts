/**
 * Turns a nightly backup (.sqrb from GitHub → Actions → Nightly cloud backup) back into
 * the app's backup file:
 *   npm run decrypt-backup -- StockQR-cloud-backup.sqrb restored.json
 * Passphrase: BACKUP_PASSPHRASE in server/.env (or the environment).
 * Then on a phone: Settings → Data → Restore from backup → pick restored.json.
 */
import fs from 'node:fs';
import { loadEnv } from '../src/env.js';
import { decryptBackup } from '../src/backupCrypto.js';

loadEnv();
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: npm run decrypt-backup -- <file.sqrb> <output.json>');
const pass = process.env.BACKUP_PASSPHRASE;
if (!pass) throw new Error('BACKUP_PASSPHRASE is not set (server/.env)');
const json = decryptBackup(fs.readFileSync(input), pass);
fs.writeFileSync(output, json);
const data = JSON.parse(json);
console.log(`Restored ${data.products.length} products and ${data.transactions.length} transactions → ${output}`);
