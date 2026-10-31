/**
 * Client for the Stock QR backend (server/ — Hono on Vercel + Neon Postgres).
 * The device token lives in the system keychain (SecureStore) on phones and in
 * localStorage in the iPhone web app.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Product, StockTransaction } from '../types/inventory';

const TOKEN_KEY = 'stockqr_api_token_v1';
const EMAIL_KEY = 'stockqr_api_email_v1';

export const API_URL: string = String(
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl || ''
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---- token storage ---------------------------------------------------------

const webStore = () => (globalThis as any).localStorage as Storage | undefined;

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStore()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') return webStore()?.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string) {
  if (Platform.OS === 'web') return webStore()?.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

export interface Session {
  token: string;
  email: string;
}

export async function loadSession(): Promise<Session | null> {
  const [token, email] = await Promise.all([getItem(TOKEN_KEY), getItem(EMAIL_KEY)]);
  return token && email ? { token, email } : null;
}

export async function saveSession(s: Session) {
  await Promise.all([setItem(TOKEN_KEY, s.token), setItem(EMAIL_KEY, s.email)]);
}

export async function clearSession() {
  await Promise.all([removeItem(TOKEN_KEY), removeItem(EMAIL_KEY)]);
}

// ---- requests ----------------------------------------------------------------

async function request<T>(path: string, opts: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'The cloud server is not configured in this build.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'No connection to the server. Changes are saved on this phone and will sync later.');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Server error (${res.status})`);
  return data as T;
}

export const api = {
  status: () => request<{ hasOwner: boolean }>('/auth/status'),
  login: (email: string, password: string) =>
    request<{ token: string; email: string }>('/auth/login', { body: { email, password } }),
  setup: (setupKey: string, email: string, password: string) =>
    request<{ token: string; email: string }>('/auth/setup', { body: { setupKey, email, password } }),
  me: (token: string) => request<{ email: string }>('/auth/me', { token }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<{ token: string }>('/auth/password', { token, body: { currentPassword, newPassword } }),
  logoutAll: (token: string) => request<{ ok: boolean }>('/auth/logout-all', { token, body: {} }),
  sync: (
    token: string,
    body: { cursor: number; products: Omit<Product, 'synced'>[]; transactions: Omit<StockTransaction, 'synced'>[] }
  ) =>
    request<{
      cursor: number;
      hasMore: boolean;
      products: Product[];
      transactions: StockTransaction[];
      rejected: { kind: 'product' | 'transaction'; id: string; reason: string }[];
    }>('/sync', { token, body, timeoutMs: 45_000 }),
};
