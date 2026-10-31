import { buildBackup, parseBackup, backupFileName, BACKUP_FORMAT } from '../src/services/backup';
import { InventoryState } from '../src/types/inventory';
const product = { id: 'p', name: 'Tea', category: 'Food', qrCode: 'STK-TEAX-1234', quantity: 2, openingQuantity: 2, minStockLevel: 0, buyingPrice: 1, sellingPrice: 2, updatedAt: '2026-01-01T00:00:00Z', synced: true };
const tx = { id: 't', productId: 'p', productName: 'Tea', type: 'SALE' as const, quantity: 1, unitBuyingPrice: 1, unitSellingPrice: 2, performedByRole: 'OWNER' as const, timestamp: '2026-01-01T00:00:00Z', synced: false };
const state: InventoryState = { products: [product], transactions: [tx] };

test('buildBackup uses the supported backup format', () => expect(buildBackup(state, 'v2.5.0', 'USD').format).toBe(BACKUP_FORMAT));
test('buildBackup retains app version and currency', () => expect(buildBackup(state, 'v2.5.0', 'EUR')).toMatchObject({ appVersion: 'v2.5.0', currency: 'EUR', version: 1 }));
test('buildBackup strips synced from products', () => expect(buildBackup(state, 'v', 'USD').products[0]).not.toHaveProperty('synced'));
test('buildBackup strips synced from transactions', () => expect(buildBackup(state, 'v', 'USD').transactions[0]).not.toHaveProperty('synced'));
test('parseBackup rejects non JSON', () => expect(() => parseBackup('nope')).toThrow('not valid JSON'));
test('parseBackup rejects wrong format', () => expect(() => parseBackup(JSON.stringify({ format: 'other', products: [], transactions: [] }))).toThrow('not a Stock QR backup'));
test('parseBackup rejects missing arrays', () => expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, products: [] }))).toThrow());
test('parseBackup keeps valid records', () => expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, products: [product], transactions: [tx] })).products).toHaveLength(1));
test('parseBackup filters invalid products', () => expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, products: [product, {}], transactions: [tx] })).products).toHaveLength(1));
test('parseBackup filters invalid transactions', () => expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, products: [product], transactions: [tx, {}] })).transactions).toHaveLength(1));
test('backupFileName includes year month and day', () => expect(backupFileName(new Date(2026, 9, 31, 12))).toBe('StockQR-backup-2026-10-31.json'));
