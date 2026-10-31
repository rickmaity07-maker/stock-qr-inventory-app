import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { InventoryProvider, useInventory, InventoryError } from '../src/context/InventoryContext';
import { STORAGE_KEYS } from '../src/services/storage';

jest.mock('expo-constants', () => ({ expoConfig: { version: '2.5.0' } }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `hash:${value}`),
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n).fill(7)),
}));
jest.mock('../src/services/liveRelay', () => ({ publishState: jest.fn(async () => true), pollPackets: jest.fn(async () => ({ packets: [], lastId: null })) }));
global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as jest.Mock;

const wrapper = ({ children }: React.PropsWithChildren) => <InventoryProvider>{children}</InventoryProvider>;
const setup = async () => {
  const hook = renderHook(() => useInventory(), { wrapper });
  await waitFor(() => expect(hook.result.current.isReady).toBe(true));
  return hook;
};
const productInput = (overrides: Partial<Parameters<ReturnType<typeof useInventory>['addProduct']>[0]> = {}) => ({
  name: 'Oat Milk', category: 'Drinks', buyingPrice: 2, sellingPrice: 4, quantity: 8, minStockLevel: 2, ...overrides,
});

beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); });

test('empty first launch loads sample catalogue and becomes ready', async () => {
  const { result } = await setup();
  expect(result.current.isReady).toBe(true);
  expect(result.current.isSampleData).toBe(true);
  expect(result.current.products.length).toBeGreaterThan(0);
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS))!).length).toBe(result.current.products.length);
});

test.each(['Tea', 'Rice', 'Green Tea', 'Rice Flour'])('legacy stored product named %s and small catalogue survives migration', async name => {
  const legacy = { id: `legacy-${name}`, name, category: 'Food', qrCode: 'STK-TEST-1234', quantity: 17, buyingPrice: 3, sellingPrice: 5, minStockLevel: 1, updatedAt: '2025-01-01T00:00:00.000Z' };
  await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([legacy]));
  await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, '[]');
  const { result } = await setup();
  expect(result.current.products).toHaveLength(1);
  expect(result.current.products[0]).toMatchObject({ id: legacy.id, quantity: 17, openingQuantity: 17 });
  expect(result.current.isSampleData).toBe(false);
});

test('offline fetch leaves stored inventory unchanged', async () => {
  const legacy = { id: 'offline-p', name: 'Stored', category: 'Food', qrCode: 'STK-STOR-1234', quantity: 9, openingQuantity: 9, buyingPrice: 1, sellingPrice: 2, minStockLevel: 1, updatedAt: '2025-01-01T00:00:00.000Z' };
  await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([legacy]));
  await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, '[]');
  const { result } = await setup();
  expect(result.current.products.map(p => p.id)).toEqual(['offline-p']);
  expect(result.current.products[0].quantity).toBe(9);
});

test('sales decrement stock, retain unit prices and reject overselling', async () => {
  const { result } = await setup();
  let p: any;
  await act(async () => { p = await result.current.addProduct(productInput()); });
  await act(async () => { await result.current.recordSale(p.id, 3); });
  expect(result.current.getProduct(p.id)?.quantity).toBe(5);
  expect(result.current.transactions[0]).toMatchObject({ type: 'SALE', quantity: 3, unitBuyingPrice: 2, unitSellingPrice: 4 });
  await expect(result.current.recordSale(p.id, 6)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
});

test('back to back sales both count before React rerenders', async () => {
  const { result } = await setup(); let p: any;
  await act(async () => { p = await result.current.addProduct(productInput({ quantity: 10 })); });
  await act(async () => { await Promise.all([result.current.recordSale(p.id, 2), result.current.recordSale(p.id, 3)]); });
  expect(result.current.getProduct(p.id)?.quantity).toBe(5);
  expect(result.current.transactions.filter(t => t.type === 'SALE' && t.productId === p.id).reduce((n, t) => n + t.quantity, 0)).toBe(5);
});

test('restock raises quantity and updates buying price', async () => {
  const { result } = await setup(); let p: any;
  await act(async () => { p = await result.current.addProduct(productInput({ quantity: 4 })); });
  await act(async () => { await result.current.recordRestock(p.id, 6, 2.5); });
  expect(result.current.getProduct(p.id)).toMatchObject({ quantity: 10, buyingPrice: 2.5 });
  expect(result.current.transactions[0]).toMatchObject({ type: 'RESTOCK', quantity: 6, unitBuyingPrice: 2.5 });
});

test('quantity edit records one adjustment and updates visible quantity', async () => {
  const { result } = await setup(); let p: any;
  await act(async () => { p = await result.current.addProduct(productInput()); });
  const before = result.current.transactions.filter(t => t.productId === p.id).length;
  await act(async () => { await result.current.updateProduct(p.id, { quantity: 13 }); });
  expect(result.current.getProduct(p.id)?.quantity).toBe(13);
  expect(result.current.transactions.filter(t => t.productId === p.id)).toHaveLength(before + 1);
  expect(result.current.transactions.find(t => t.productId === p.id)?.type).toBe('ADJUST');
});

test('deleted product is hidden while its sales remain in monthly totals', async () => {
  const { result } = await setup(); let p: any;
  await act(async () => { p = await result.current.addProduct(productInput()); await result.current.recordSale(p.id, 1); });
  const key = new Date().toISOString().slice(0, 7);
  await act(async () => { await result.current.deleteProduct(p.id); });
  expect(result.current.products.some(x => x.id === p.id)).toBe(false);
  expect(result.current.getMonthlySummary(key).totalUnitsSold).toBeGreaterThanOrEqual(1);
});

test('QR codes are unique and duplicate factory barcode is rejected', async () => {
  const { result } = await setup(); let a: any; let b: any;
  await act(async () => { a = await result.current.addProduct(productInput({ factoryBarcode: 'ABC-1' })); b = await result.current.addProduct(productInput({ name: 'Oat Drink' })); });
  expect(a.qrCode).toMatch(/^STK-[A-Z0-9]{4}-[A-Z0-9]{4,}$/);
  expect(b.qrCode).not.toBe(a.qrCode);
  await expect(result.current.addProduct(productInput({ name: 'Duplicate', factoryBarcode: 'abc-1' }))).rejects.toMatchObject({ code: 'BARCODE_IN_USE' });
});

test('default owner PIN unlocks after switching to staff', async () => {
  const { result } = await setup();
  await act(async () => { await result.current.switchToStaffRole(); });
  expect(result.current.role).toBe('STAFF');
  await act(async () => { expect(await result.current.unlockOwnerRole('1234')).toBe('ok'); });
  expect(result.current.role).toBe('OWNER');
});

test('five bad PIN attempts lock owner access', async () => {
  const { result } = await setup();
  await act(async () => { for (let i = 0; i < 5; i++) await result.current.unlockOwnerRole('0000'); });
  expect(result.current.pinLockedUntil).toBeGreaterThan(Date.now());
  await act(async () => { expect(await result.current.unlockOwnerRole('1234')).toBe('locked'); });
});

test.each(['12', '123456789', '12a4', ''])('rejects invalid owner PIN %p', async pin => {
  const { result } = await setup();
  await expect(result.current.updateOwnerPin(pin)).rejects.toMatchObject({ code: 'INVALID' });
});

test('owner PIN hash is persisted without plaintext', async () => {
  const { result } = await setup(); await act(async () => { await result.current.updateOwnerPin('9876'); });
  const values = await AsyncStorage.getAllKeys();
  const stored = await AsyncStorage.multiGet(values);
  expect(stored.find(([k]) => k === STORAGE_KEYS.OWNER_PIN_HASH)?.[1]).toBe('hash:stockqr-pin:9876');
  expect(stored.some(([, v]) => v === '9876')).toBe(false);
});

test('EUR setting persists and money formatter uses euro', async () => {
  const { result } = await setup(); await act(async () => { await result.current.setCurrency('EUR'); });
  expect(await AsyncStorage.getItem(STORAGE_KEYS.CURRENCY)).toBe('EUR');
  const { formatMoney } = require('../src/logic/money');
  expect(formatMoney(12)).toContain('€');
});

test('backup restore merges incoming products and transactions', async () => {
  const first = await setup(); let p: any;
  await act(async () => { p = await first.result.current.addProduct(productInput({ name: 'Local' })); });
  const backup = first.result.current.makeBackup();
  const fresh = await setup();
  const incoming = { ...backup, products: [...backup.products, { ...p, id: 'imported-product', name: 'Imported', qrCode: 'STK-IMPO-1234' }], transactions: [...backup.transactions] };
  await act(async () => { await fresh.result.current.restoreBackup(incoming); });
  expect(fresh.result.current.products.some(x => x.id === p.id)).toBe(true);
  expect(fresh.result.current.products.some(x => x.id === 'imported-product')).toBe(true);
  first.unmount(); fresh.unmount();
});

test('joinStoreSync rejects garbage and accepts a valid pairing payload', async () => {
  const { result } = await setup();
  await act(async () => { await expect(result.current.joinStoreSync('garbage')).resolves.toMatchObject({ ok: false }); });
  await act(async () => { await expect(result.current.joinStoreSync(`STOCKQR-SYNC:${'a'.repeat(26)}`)).resolves.toMatchObject({ ok: true }); });
});
