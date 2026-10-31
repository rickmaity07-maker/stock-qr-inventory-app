/** Loads server/.env for local scripts (Vercel provides env vars itself). */
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(dir = process.cwd()) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
