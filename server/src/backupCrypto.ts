/**
 * Backup files are gzip-compressed and encrypted (AES-256-GCM, key from the passphrase
 * via scrypt), because GitHub Actions files on a public repository can be downloaded by others.
 * Layout: "SQRB1" | salt(16) | iv(12) | tag(16) | ciphertext
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const MAGIC = Buffer.from('SQRB1');

export function encryptBackup(json: string, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(zlib.gzipSync(json)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(file: Buffer, passphrase: string): string {
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Stock QR encrypted backup');
  let o = MAGIC.length;
  const salt = file.subarray(o, (o += 16));
  const iv = file.subarray(o, (o += 12));
  const tag = file.subarray(o, (o += 16));
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return zlib.gunzipSync(Buffer.concat([decipher.update(file.subarray(o)), decipher.final()])).toString('utf8');
  } catch {
    throw new Error('Wrong passphrase or damaged file');
  }
}
