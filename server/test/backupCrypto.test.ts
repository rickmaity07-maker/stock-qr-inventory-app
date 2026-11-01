import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup } from '../src/backupCrypto.js';

describe('backup encryption', () => {
  const json = JSON.stringify({ format: 'stockqr-backup', products: [{ name: 'Café crème' }], transactions: [] });

  it('round-trips with the right passphrase', () => {
    expect(decryptBackup(encryptBackup(json, 'a long passphrase!!'), 'a long passphrase!!')).toBe(json);
  });

  it('does not contain the data in readable form', () => {
    expect(encryptBackup(json, 'a long passphrase!!').toString('latin1')).not.toContain('stockqr-backup');
  });

  it('fails clearly with the wrong passphrase or a tampered file', () => {
    const file = encryptBackup(json, 'a long passphrase!!');
    expect(() => decryptBackup(file, 'wrong passphrase!!!')).toThrow('Wrong passphrase');
    file[file.length - 1] ^= 1;
    expect(() => decryptBackup(file, 'a long passphrase!!')).toThrow('Wrong passphrase');
    expect(() => decryptBackup(Buffer.from('hello'), 'x')).toThrow('Not a Stock QR');
  });
});
