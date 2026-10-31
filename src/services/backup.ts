/**
 * Full inventory backup as a JSON file, and restore from one.
 * Restoring merges (never deletes): products and sales from the file are added to what is on the phone.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { InventoryState } from '../types/inventory';
import { isValidProduct, isValidTransaction, localMonthKey } from '../logic/inventoryLogic';

export const BACKUP_FORMAT = 'stockqr-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  appVersion: string;
  currency: string;
  products: InventoryState['products'];
  transactions: InventoryState['transactions'];
}

export function buildBackup(state: InventoryState, appVersion: string, currency: string): BackupFile {
  const strip = <T extends { synced?: boolean }>(list: T[]) => list.map(({ synced, ...rest }) => rest as T);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion,
    currency,
    products: strip(state.products),
    transactions: strip(state.transactions),
  };
}

/** Validates a backup file's text. Throws a readable error when it is not a backup. */
export function parseBackup(text: string): BackupFile {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Stock QR backup (it is not valid JSON).');
  }
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.products) || !Array.isArray(data.transactions)) {
    throw new Error('That file is not a Stock QR backup.');
  }
  return {
    ...data,
    products: data.products.filter(isValidProduct),
    transactions: data.transactions.filter(isValidTransaction),
  } as BackupFile;
}

export function backupFileName(now = new Date()): string {
  return `StockQR-backup-${localMonthKey(now)}-${String(now.getDate()).padStart(2, '0')}.json`;
}

/** Saves/shares the backup file (share sheet on phones, download in the browser). */
export async function shareBackup(backup: BackupFile): Promise<void> {
  const text = JSON.stringify(backup);
  const name = backupFileName();
  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save inventory backup', UTI: 'public.json' });
}

/** Lets the user pick a backup file; resolves null if they cancel. */
export async function pickBackup(): Promise<BackupFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  let text: string;
  if (Platform.OS === 'web') {
    const file = (asset as any).file as Blob | undefined;
    text = file ? await file.text() : await (await fetch(asset.uri)).text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  }
  return parseBackup(text);
}
