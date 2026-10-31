/**
 * Keeps phones in step. Two transports:
 *  - "relay": zero-setup, private per-store channel on ntfy.sh (default)
 *  - "supabase": the owner's own Supabase project (advanced)
 * The engine never overwrites local data; it merges (see mergeStates).
 */
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { CloudConfig, InventoryState } from '../types/inventory';
import { mergeStates, sameContent } from '../logic/inventoryLogic';
import { pollPackets, publishState } from '../services/liveRelay';
import {
  explainSupabaseError,
  fetchAllRows,
  getSupabaseClient,
  mapDbRowToProduct,
  mapDbRowToTransaction,
  mapProductToDbRow,
  mapTransactionToDbRow,
  subscribeToLiveSync,
} from '../services/supabase';
import { removeValue, setValue, STORAGE_KEYS } from '../services/storage';

export type SyncMode = 'supabase' | 'relay' | 'off';

const RELAY_POLL_MS = 5_000;
const SYNC_DEBOUNCE_MS = 900;

export function syncModeFor(cfg: CloudConfig, syncCode: string): SyncMode {
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) return 'supabase';
  if (cfg.autoSyncEnabled && syncCode) return 'relay';
  return 'off';
}

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

interface Options {
  isReady: boolean;
  cloudConfig: CloudConfig;
  syncCode: string;
  deviceId: MutableRefObject<string>;
  relayLastId: MutableRefObject<string | null>;
  stateRef: MutableRefObject<InventoryState>;
  commit: (next: InventoryState, opts?: { sync?: boolean }) => Promise<void>;
}

export function useSyncEngine({ isReady, cloudConfig, syncCode, deviceId, relayLastId, stateRef, commit }: Options) {
  const syncMode = syncModeFor(cloudConfig, syncCode);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  const runSupabase = useCallback(async () => {
    const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    if (!client) throw new Error('Supabase URL must start with https:// and the key must be filled in.');
    const snapshot = stateRef.current;
    const upProds = snapshot.products.filter((p) => !p.synced);
    const upTxs = snapshot.transactions.filter((t) => !t.synced);
    if (upProds.length) {
      const { error } = await client.from('products').upsert(upProds.map(mapProductToDbRow));
      if (error) throw error;
    }
    if (upTxs.length) {
      const { error } = await client.from('transactions').upsert(upTxs.map(mapTransactionToDbRow));
      if (error) throw error;
    }
    const [prodRows, txRows] = await Promise.all([
      fetchAllRows(client, 'products', 'updated_at'),
      fetchAllRows(client, 'transactions', 'timestamp'),
    ]);
    const remote: InventoryState = {
      products: prodRows.map(mapDbRowToProduct),
      transactions: txRows.map(mapDbRowToTransaction),
    };
    const merged = mergeStates(markUploaded({ products: upProds, transactions: upTxs }, stateRef.current), remote);
    if (!sameContent(merged, stateRef.current) || upProds.length || upTxs.length) {
      await commit(merged, { sync: false });
    }
  }, [cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey, stateRef, commit]);

  const runRelay = useCallback(async () => {
    const snapshot = stateRef.current;
    const ok = await publishState(syncCode, deviceId.current, snapshot);
    if (!ok) throw new Error('Offline — changes are saved on this phone and will sync when you are back online.');
    await commit(markUploaded(snapshot, stateRef.current), { sync: false });
  }, [syncCode, deviceId, stateRef, commit]);

  const syncNow = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (syncMode === 'off') return { ok: false, message: 'Sync is turned off. Changes are saved on this phone only.' };
    if (running.current) {
      again.current = true;
      return { ok: true, message: 'Sync already running.' };
    }
    running.current = true;
    setIsSyncing(true);
    try {
      do {
        again.current = false;
        if (syncMode === 'supabase') await runSupabase();
        else await runRelay();
      } while (again.current);
      setLastSyncedAt(new Date().toISOString());
      setLastSyncError(null);
      return {
        ok: true,
        message: syncMode === 'supabase' ? 'Synced with your Supabase database.' : 'Synced with every phone paired to this store.',
      };
    } catch (err: any) {
      const message = syncMode === 'supabase' ? explainSupabaseError(err) : String(err?.message || err);
      setLastSyncError(message);
      return { ok: false, message };
    } finally {
      running.current = false;
      setIsSyncing(false);
    }
  }, [syncMode, runSupabase, runRelay]);

  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  // Debounced upload after local changes
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSync = useCallback(() => {
    if (!cloudConfig.autoSyncEnabled || syncMode === 'off') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => syncRef.current(), SYNC_DEBOUNCE_MS);
  }, [cloudConfig.autoSyncEnabled, syncMode]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Foreground only: no polling while the app is in the background
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Relay: share our state on launch/resume, then poll other phones
  useEffect(() => {
    if (!isReady || syncMode !== 'relay' || !appActive) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const { packets, lastId } = await pollPackets(syncCode, deviceId.current, relayLastId.current);
        if (cancelled) return;
        if (lastId && lastId !== relayLastId.current) {
          relayLastId.current = lastId;
          setValue(STORAGE_KEYS.RELAY_LAST_ID, lastId).catch(() => {});
        }
        if (packets.length) {
          const merged = packets.reduce<InventoryState>(
            (acc, pkt) => mergeStates(acc, { products: pkt.products, transactions: pkt.transactions }),
            stateRef.current
          );
          if (!sameContent(merged, stateRef.current)) await commit(merged, { sync: false });
          setLastSyncedAt(new Date().toISOString());
        }
      } catch {
        // offline: try again next tick
      } finally {
        polling = false;
      }
    };
    syncRef.current();
    poll();
    const id = setInterval(poll, RELAY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isReady, syncMode, syncCode, appActive, deviceId, relayLastId, stateRef, commit]);

  // Supabase: sync on launch and whenever another device changes a row
  useEffect(() => {
    if (!isReady || syncMode !== 'supabase' || !cloudConfig.autoSyncEnabled) return;
    const client = getSupabaseClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    if (!client) return;
    syncRef.current();
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToLiveSync(client, () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => syncRef.current(), 600);
    });
    return () => {
      if (t) clearTimeout(t);
      unsubscribe();
    };
  }, [isReady, syncMode, cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey, cloudConfig.autoSyncEnabled]);

  /** Forget where we were in the relay stream (after joining or creating a store code). */
  const resetRelayCursor = useCallback(async () => {
    relayLastId.current = null;
    await removeValue(STORAGE_KEYS.RELAY_LAST_ID);
  }, [relayLastId]);

  return { syncMode, isSyncing, lastSyncedAt, lastSyncError, syncNow, scheduleSync, resetRelayCursor };
}
