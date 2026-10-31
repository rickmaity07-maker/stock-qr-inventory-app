/**
 * Emergency owner password reset (signs out every device):
 *   npm run set-password -- you@example.com "new password"
 */
import { neonDb } from '../src/db';
import { loadEnv } from '../src/env';
import { setPassword } from '../src/auth';

loadEnv();
const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run set-password -- <email> "<password, 8+ characters>"');
  process.exit(1);
}
await setPassword(neonDb(process.env.DATABASE_URL as string), email.trim().toLowerCase(), password);
console.log(`Password set for ${email}. All devices must sign in again.`);
