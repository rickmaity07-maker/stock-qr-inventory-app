import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../src/services/storage';
let mockScreenRole = 'OWNER';
jest.mock('../src/context/InventoryContext', () => ({
  InventoryProvider: ({ children }: any) => children,
  useInventory: () => new Proxy({ isReady: true, products: [], transactions: [], role: mockScreenRole, scannerMode: 'SELL', isSampleData: false, isClientDemoLocked: false, demoActionsRemaining: 3, lowStockProducts: [], expiringProducts: [], currency: 'USD', cloudConfig: { supabaseUrl: '', supabaseAnonKey: '', autoSyncEnabled: false }, syncMode: 'off', unsyncedCount: 0, isSyncing: false, lastSyncError: null, lastSyncedAt: null, pinIsDefault: false, pinLockedUntil: 0, availableMonths: [], setScannerMode: jest.fn(), addProduct: jest.fn(), updateProduct: jest.fn(), deleteProduct: jest.fn(), recordSale: jest.fn(), recordRestock: jest.fn(), switchToStaffRole: jest.fn(async () => { mockScreenRole = 'STAFF'; }), unlockOwnerRole: jest.fn(async () => 'ok'), getMonthlySummary: jest.fn(() => ({ monthLabel: 'October 2026', totalRevenue: 0, totalCostOfGoods: 0, grossProfit: 0, profitMarginPercent: 0, totalUnitsSold: 0, totalUnitsRestocked: 0, restockSpend: 0, bestSellers: [], worstSellers: [], salesTransactions: [] })), setCurrency: jest.fn(), updateOwnerPin: jest.fn(), makeBackup: jest.fn(), restoreBackup: jest.fn(), syncWithCloud: jest.fn(), updateCloudConfig: jest.fn(), joinStoreSync: jest.fn(), createNewSyncCode: jest.fn(), checkForAppUpdate: jest.fn(), findProductByCode: jest.fn(), getProduct: jest.fn(), consumeDemoAction: jest.fn(() => true), unlockClientDemo: jest.fn(async () => true) }, { get: (target: any, key: string) => key in target ? target[key] : jest.fn() })
}));
import App from '../App';

jest.mock('expo-constants', () => ({ expoConfig: { version: '2.5.0', extra: { apiUrl: '' } } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: jest.fn(async (_: string, s: string) => `hash:${s}`), getRandomBytes: jest.fn((n: number) => new Uint8Array(n).fill(3)) }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn(async () => ({ granted: true }))] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: any) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}), impactAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as jest.Mock;
beforeEach(async () => { mockScreenRole = 'OWNER'; await AsyncStorage.clear(); jest.clearAllMocks(); });

test('App loads and presents the Scan screen', async () => {
 const ui = render(<App />); await waitFor(() => expect(ui.getByRole('tab', { name: 'Scan' })).toBeTruthy());
 expect(ui.getByText(/Scanning takes items out of stock/)).toBeTruthy();
});
test.each(['Products', 'Stock', 'Profit', 'Settings'])('tab navigation opens %s screen', async label => {
 const ui = render(<App />); await waitFor(() => expect(ui.getByRole('tab', { name: 'Scan' })).toBeTruthy());
 fireEvent.press(ui.getByRole('tab', { name: label }));
 await waitFor(() => expect(ui.getAllByText(label).length).toBeGreaterThan(0));
});
test('empty product form displays inline required-name error', async () => {
 const ui = render(<App />); await waitFor(() => expect(ui.getByRole('tab', { name: 'Scan' })).toBeTruthy());
 fireEvent.press(ui.getByRole('tab', { name: 'Products' }));
 fireEvent.press(ui.getByLabelText('Add product'));
 fireEvent.press(ui.getByText('Add product and create QR'));
 await waitFor(() => expect(ui.getByText('Enter a product name')).toBeTruthy());
});
test('Profit tab is owner only in staff mode', async () => {
 mockScreenRole = 'STAFF';
 const ui = render(<App />); await waitFor(() => expect(ui.getByRole('tab', { name: 'Scan' })).toBeTruthy());
 fireEvent.press(ui.getByRole('tab', { name: 'Profit' }));
 await waitFor(() => expect(ui.getByText('Owner only')).toBeTruthy());
});
