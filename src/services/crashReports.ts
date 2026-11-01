/**
 * Crash reports: when something breaks, a short report (message, where, app version,
 * phone type) is saved on the phone and sent to the shop's own server the next time the
 * phone is signed in and online. No inventory data is included. The developer reads
 * them with `npm run errors` in server/.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { api, ApiError, loadSession } from './api';

const QUEUE_KEY = '@stockqr_error_queue_v7';
const MAX_QUEUED = 20;

export interface ErrorReportIn {
  message: string;
  stack?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  context?: string | null;
  at?: string | null;
}

// Harmless browser noise and expected network failures are not crashes
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /AbortError/i, /No connection to the server/i];

let lastKey = '';
let lastAt = 0;
let pending: Promise<void> = Promise.resolve();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function toReport(error: unknown, context?: string): ErrorReportIn | null {
  const err = error instanceof Error ? error : null;
  const message = String(err?.message ?? (typeof error === 'string' ? error : JSON.stringify(error) ?? 'Unknown error')).slice(0, 2000);
  if (!message || IGNORE.some((re) => re.test(message))) return null;
  if (error instanceof ApiError) return null;
  return {
    message,
    stack: err?.stack?.slice(0, 8000) ?? null,
    appVersion: Constants.expoConfig?.version ?? null,
    platform: `${Platform.OS}${Platform.Version ? ' ' + String(Platform.Version).slice(0, 20) : ''}`,
    context: context?.slice(0, 2000) ?? null,
    at: new Date().toISOString(),
  };
}

async function readQueue(): Promise<ErrorReportIn[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Saves a report on the phone and tries to send it. Never throws. */
export function recordError(error: unknown, context?: string): Promise<void> {
  const report = toReport(error, context);
  if (!report) return pending;
  // The same error repeating in a loop is reported once
  const key = `${report.message}|${context ?? ''}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < 10_000) return pending;
  lastKey = key;
  lastAt = now;
  pending = pending
    .then(async () => {
      const queue = [...(await readQueue()), report].slice(-MAX_QUEUED);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    })
    .catch(() => {});
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushErrorReports().catch(() => {});
  }, 3000);
  (flushTimer as any)?.unref?.();
  return pending;
}

/** Sends saved reports when signed in. Kept on the phone if offline. */
export async function flushErrorReports(): Promise<number> {
  await pending;
  const queue = await readQueue();
  if (!queue.length) return 0;
  const session = await loadSession().catch(() => null);
  if (!session) return 0;
  try {
    await api.sendErrors(session.token, queue);
  } catch (e) {
    // Offline or signed out: try again later. Anything else (old server, bad data): drop them.
    if (e instanceof ApiError && (e.status === 0 || e.status === 401 || e.status === 429 || e.status >= 500)) return 0;
  }
  // Remove what was sent (or dropped), keep anything recorded meanwhile
  await (pending = pending.then(async () => {
    const now = await readQueue();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(now.slice(queue.length)));
  }).catch(() => {}));
  return queue.length;
}

let installed = false;

/** Catches errors that nothing else handled. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    const w = globalThis as any;
    w.addEventListener?.('error', (e: any) => recordError(e?.error ?? e?.message, 'uncaught'));
    w.addEventListener?.('unhandledrejection', (e: any) => recordError(e?.reason, 'unhandled promise'));
    return;
  }
  const EU = (globalThis as any).ErrorUtils;
  if (!EU?.setGlobalHandler) return;
  const previous = EU.getGlobalHandler?.();
  EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    recordError(error, isFatal ? 'fatal crash' : 'uncaught');
    previous?.(error, isFatal);
  });
}

/** Test helper */
export function __resetCrashReportsForTests() {
  lastKey = '';
  lastAt = 0;
  pending = Promise.resolve();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
