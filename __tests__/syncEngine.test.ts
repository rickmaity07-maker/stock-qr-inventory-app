jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { markUploaded } from '../src/sync/useSyncEngine';
import { InventoryState } from '../src/types/inventory';
const state = (): InventoryState => ({ products: [{ id: 'p', name: 'Tea', category: 'Food', qrCode: 'STK-TEAX-1234', quantity: 2, openingQuantity: 2, minStockLevel: 0, buyingPrice: 1, sellingPrice: 2, updatedAt: '2026-01-01T00:00:00Z', synced: false }], transactions: [{ id: 't', productId: 'p', productName: 'Tea', type: 'SALE', quantity: 1, unitBuyingPrice: 1, unitSellingPrice: 2, performedByRole: 'OWNER', timestamp: '2026-01-01T00:00:00Z', synced: false }] });

test('markUploaded marks uploaded product and transaction synced', () => {
 const uploaded = state(); const out = markUploaded(uploaded, state());
 expect(out.products[0].synced).toBe(true); expect(out.transactions[0].synced).toBe(true);
});
test('markUploaded preserves product changed after upload', () => {
 const uploaded = state(); const base = state(); base.products[0].updatedAt = '2026-02-01T00:00:00Z';
 expect(markUploaded(uploaded, base).products[0].synced).toBe(false);
});
test('markUploaded leaves newly added product unsynced', () => {
 const uploaded = state(); uploaded.products = [];
 expect(markUploaded(uploaded, state()).products[0].synced).toBe(false);
});
test('markUploaded leaves transaction not in upload unsynced', () => {
 const uploaded = state(); uploaded.transactions = [];
 expect(markUploaded(uploaded, state()).transactions[0].synced).toBe(false);
});
test('markUploaded preserves already-synced records', () => {
 const uploaded = state(); const base = state(); base.products[0].synced = true; base.transactions[0].synced = true;
 const out = markUploaded(uploaded, base); expect(out.products[0].synced).toBe(true); expect(out.transactions[0].synced).toBe(true);
});
