jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-constants', () => ({ expoConfig: { version: '2.7.0', extra: { apiUrl: 'https://api.test/api' } } }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
    __store: store,
  };
});
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '../src/services/api';
import { __resetCrashReportsForTests, flushErrorReports, recordError } from '../src/services/crashReports';

const QUEUE = '@stockqr_error_queue_v7';
const queue = async () => JSON.parse((await AsyncStorage.getItem(QUEUE)) ?? '[]');
const signIn = () => {
  const s = require('expo-secure-store').__store as Map<string, string>;
  s.set('stockqr_api_token_v1', 'tok');
  s.set('stockqr_api_email_v1', 'o@shop.test');
};
const respond = (status: number) => (global.fetch as jest.Mock).mockImplementation(() => Promise.resolve({ ok: status < 400, status, text: async () => '{}' }));

beforeEach(async () => {
  jest.useRealTimers();
  await AsyncStorage.clear();
  (require('expo-secure-store').__store as Map<string, string>).clear();
  global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as jest.Mock;
  __resetCrashReportsForTests();
});

test('a crash is saved on the phone with version and where it happened, without inventory data', async () => {
  await recordError(new Error('boom'), 'screen crashed: StockScreen');
  const [r] = await queue();
  expect(r).toMatchObject({ message: 'boom', appVersion: '2.7.0', context: 'screen crashed: StockScreen' });
  expect(r.stack).toContain('boom');
  expect(Object.keys(r).sort()).toEqual(['appVersion', 'at', 'context', 'message', 'platform', 'stack']);
});

test('the same error repeating in a loop is saved once; noise and network errors are ignored', async () => {
  for (let i = 0; i < 5; i++) await recordError(new Error('loop'), 'x');
  await recordError(new Error('ResizeObserver loop limit exceeded'));
  await recordError(new ApiError(0, 'No connection to the server.'));
  await recordError(new Error('other'));
  expect((await queue()).map((r: any) => r.message)).toEqual(['loop', 'other']);
});

test('keeps at most 20 reports', async () => {
  for (let i = 0; i < 25; i++) await recordError(new Error(`e${i}`));
  const q = await queue();
  expect(q).toHaveLength(20);
  expect(q[19].message).toBe('e24');
});

test('signed out: nothing is sent and reports stay on the phone', async () => {
  await recordError(new Error('a'));
  expect(await flushErrorReports()).toBe(0);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(await queue()).toHaveLength(1);
});

test('signed in: reports are sent and removed; offline keeps them for later', async () => {
  signIn();
  await recordError(new Error('a'));
  expect(await flushErrorReports()).toBe(0); // offline
  expect(await queue()).toHaveLength(1);
  respond(200);
  expect(await flushErrorReports()).toBe(1);
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls.at(-1)[1].body);
  expect(body.reports[0].message).toBe('a');
  expect((global.fetch as jest.Mock).mock.calls.at(-1)[0]).toBe('https://api.test/api/errors');
  expect(await queue()).toEqual([]);
});

test('an older server without crash reports drops them instead of retrying forever', async () => {
  signIn();
  await recordError(new Error('a'));
  respond(404);
  await flushErrorReports();
  expect(await queue()).toEqual([]);
});
