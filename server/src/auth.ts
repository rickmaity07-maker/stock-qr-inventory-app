/** Owner sign-in: bcrypt-hashed password, signed device tokens, rate-limited attempts. */
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { Db } from './db.js';

const TOKEN_DAYS = 180;
const MAX_FAILED = 8;
const WINDOW_MINUTES = 15;

export interface OwnerRow {
  email: string;
  password_hash: string;
  token_version: number;
}

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function getOwner(db: Db): Promise<OwnerRow | null> {
  const rows = await db.query<OwnerRow>('select email, password_hash, token_version from owner_account where id = 1');
  return rows[0] ?? null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 11);
}

export async function createOwner(db: Db, email: string, password: string) {
  const hash = await hashPassword(password);
  const rows = await db.query(
    `insert into owner_account (id, email, password_hash) values (1, $1, $2)
     on conflict (id) do nothing returning email`,
    [email, hash]
  );
  return rows.length === 1;
}

/** Sets a new password and signs out every device (used by the reset script too). */
export async function setPassword(db: Db, email: string, password: string) {
  const hash = await hashPassword(password);
  await db.query(
    `insert into owner_account (id, email, password_hash) values (1, $1, $2)
     on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash,
       token_version = owner_account.token_version + 1, updated_at = now()`,
    [email, hash]
  );
}

export async function issueToken(secret: string, tokenVersion: number) {
  return new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('owner')
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_DAYS}d`)
    .sign(key(secret));
}

/** Returns the owner when the token is valid and not revoked, else null. */
export async function verifyToken(db: Db, secret: string, token: string): Promise<OwnerRow | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    if (payload.sub !== 'owner') return null;
    const owner = await getOwner(db);
    if (!owner || owner.token_version !== payload.tv) return null;
    return owner;
  } catch {
    return null;
  }
}

export async function tooManyAttempts(db: Db, attemptKey: string) {
  const rows = await db.query<{ n: string }>(
    `select count(*)::text as n from login_attempts where key = $1 and at > now() - ($2 || ' minutes')::interval`,
    [attemptKey, String(WINDOW_MINUTES)]
  );
  return Number(rows[0]?.n ?? 0) >= MAX_FAILED;
}

export async function recordFailure(db: Db, attemptKey: string) {
  await db.query('insert into login_attempts (key) values ($1)', [attemptKey]);
  // keep the table small
  await db.query(`delete from login_attempts where at < now() - interval '1 day'`);
}

export async function clearFailures(db: Db, attemptKey: string) {
  await db.query('delete from login_attempts where key = $1', [attemptKey]);
}

export async function checkPassword(owner: OwnerRow, password: string) {
  return bcrypt.compare(password, owner.password_hash);
}

/** Constant-time string comparison for the one-time setup key. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
