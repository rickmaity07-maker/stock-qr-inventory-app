/**
 * Keeps this phone in step with the cloud (server/ API on Vercel + Neon).
 *  - Local first: every change is saved on the phone immediately; sync never blocks selling.
 *  - Push: records not yet uploaded (synced === false), in chunks.
 *  - Pull: everything the server numbered after our cursor; merged, never overwritten.
 *  - Each app launch does one full pull (cursor 0) to heal any gap.
 */
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { InventoryState } from '../types/inventory';
import { mergeStates, sameContent } from '../logic/inventoryLogic';
import { api, ApiError, Session } from '../services/api';
import { setValue, STORAGE_KEYS } from '../services/storage';

export type SyncMode = 'cloud' | 'off';

const POLL_MS = 10_000;
const DEBOUNCE_MS = 900;
const CHUNK = 500;

/** Marks records we just uploaded as synced, unless they changed again meanwhile. */
export function markUploaded(uploaded: InventoryState, base: InventoryState): InventoryState {
  const prodVersions = new Map(uploaded.products.map((p) => [p.id, p.updatedAt]));
  const txIds = new Set(uploaded.transactions.map((t) => t.id));
  return {
    products: base.products.map((p) =>
      !p.synced && prodVersions.get(p.id) === p.updatedAt ? { ...p, synced: true } : p
    ),
    transactions: base.transactions.map((t) => (!t.synced && txIds.has(t.id) ? { ...t, synced: true } : t)),
  };
}

const strip = <T extends { synced?: boolean }>(list: T[]) => list.map(({ synced, ...rest }) => rest as T);

interface Options {
  isReady: boolean;
  session: Session | null;
  autoSync: boolean;
  initialCursor: number;
  stateRef: MutableRefObject<InventoryState>;
  commit: (next: InventoryState, opts?: { sync?: boolean }) => Promise<void>;
  onSessionExpired: () => void;
}

export function useSyncEngine({ isReady, session, autoSync, initialCursor, stateRef, commit, onSessionExpired }: Options) {
  const syncMode: SyncMode = session ? 'cloud' : 'off';
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const cursorRef = useRef(initialCursor);
  const didFullPull = useRef(false);
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    cursorRef.current = initialCursor;
  }, [initialCursor]);

  const applyServer = useCallback(
    async (res: { products: any[]; transactions: any[] }, uploaded?: InventoryState) => {
      let next = mergeStates(stateRef.current, { products: res.products, transactions: res.transactions });
      if (uploaded) next = markUploaded(uploaded, next);
      if (!sameContent(next, stateRef.current) || uploaded) await commit(next, { sync: false });
    },
    [stateRef, commit]
  );

  const runOnce = useCallback(
    async (token: string, full: boolean) => {
      let cursor = full ? 0 : cursorRef.current;
      const rejected: string[] = [];

      // 1. push in chunks (each reply also carries server changes)
      for (;;) {
        const prods = stateRef.current.products.filter((p) => !p.synced).slice(0, CHUNK);
        const txs = stateRef.current.transactions.filter((t) => !t.synced).slice(0, CHUNK);
        if (!prods.length && !txs.length) break;
        const res = await api.sync(token, { cursor, products: strip(prods), transactions: strip(txs) });
        rejected.push(...res.rejected.map((r) => `${r.id}: ${r.reason}`));
        // rejected records are marked synced too, so one bad record can't block sync forever
        await applyServer(res, { products: prods, transactions: txs });
        cursor = res.cursor;
        if (prods.length < CHUNK && txs.length < CHUNK && !res.hasMore) {
          cursorRef.current = cursor;
          return rejected;
        }
      }

      // 2. pull until caught up
      for (let page = 0; page < 200; page++) {
        const res = await api.sync(token, { cursor, products: [], transactions: [] });
        await applyServer(res);
        cursor = res.cursor;
        if (!res.hasMore) break;
      }
      cursorRef.current = cursor;
      return rejected;
    },
    [stateRef, applyServer]
  );

  const syncNow = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (!session) return { ok: false, message: 'Sign in to sync this phone with your other devices.' };
    if (running.current) {
      again.current = true;
      return { ok: true, message: 'Sync already running.' };
    }
    running.current = true;
    setIsSyncing(true);
    try {
      let rejected: string[] = [];
      do {
        again.current = false;
        const full = !didFullPull.current;
        rejected = await runOnce(session.token, full);
        didFullPull.current = true;
      } while (again.current);
      await setValue(STORAGE_KEYS.CLOUD_CURSOR, String(cursorRef.current));
      setLastSyncedAt(new Date().toISOString());
      if (rejected.length) {
        const msg = `${rejected.length} record(s) were not accepted by the server: ${rejected.slice(0, 3).join('; ')}`;
        setLastSyncError(msg);
        return { ok: false, message: msg };
      }
      setLastSyncError(null);
      return { ok: true, message: 'Everything is synced.' };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        setLastSyncError('Signed out — please sign in again.');
        return { ok: false, message: 'Your sign-in expired. Please sign in again.' };
      }
      const message = err instanceof Error ? err.message : String(err);
      setLastSyncError(message);
      return { ok: false, message };
    } finally {
      running.current = false;
      setIsSyncing(false);
    }
  }, [session, runOnce, onSessionExpired]);

  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSync = useCallback(() => {
    if (!session || !autoSync) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => syncRef.current(), DEBOUNCE_MS);
  }, [session, autoSync]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // A new session (sign-in) starts with a full pull
  useEffect(() => {
    didFullPull.current = false;
  }, [session?.token]);

  // While open and signed in: sync now, then every few seconds
  useEffect(() => {
    if (!isReady || !session || !autoSync || !appActive) return;
    syncRef.current();
    const id = setInterval(() => syncRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [isReady, session, autoSync, appActive]);

  const resetCursor = useCallback(async () => {
    cursorRef.current = 0;
    didFullPull.current = false;
    await setValue(STORAGE_KEYS.CLOUD_CURSOR, '0');
  }, []);

  return { syncMode, isSyncing, lastSyncedAt, lastSyncError, syncNow, scheduleSync, resetCursor };
}
