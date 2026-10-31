/**
 * Zero-setup sync between the store's phones through ntfy.sh.
 *
 * Every store gets its own random, unguessable channel name (the "store sync code").
 * Other phones join by scanning the pairing QR in Settings. Each change posts the
 * whole inventory; receivers merge it (see mergeStates), so missed or out-of-order
 * messages never lose a sale.
 *
 * Messages over 4 KB are stored by ntfy as an attachment; we fetch those too.
 */
import { InventoryState, Product, StockTransaction } from '../types/inventory';

const RELAY_BASE = 'https://ntfy.sh';

export interface RelayPacket {
  v: 2;
  deviceId: string;
  ts: number;
  products: Product[];
  transactions: StockTransaction[];
}

function topicUrl(syncCode: string): string {
  return `${RELAY_BASE}/stockqr-${encodeURIComponent(syncCode)}`;
}

function stripLocalFlags<T extends { synced?: boolean }>(list: T[]): T[] {
  return list.map(({ synced, ...rest }) => rest as T);
}

export async function publishState(
  syncCode: string,
  deviceId: string,
  state: InventoryState
): Promise<boolean> {
  const packet: RelayPacket = {
    v: 2,
    deviceId,
    ts: Date.now(),
    products: stripLocalFlags(state.products),
    transactions: stripLocalFlags(state.transactions),
  };
  try {
    const res = await fetch(topicUrl(syncCode), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Filename: 'inventory.json' },
      body: JSON.stringify(packet),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isPacket(x: any): x is RelayPacket {
  return Boolean(
    x && x.v === 2 && typeof x.deviceId === 'string' && Array.isArray(x.products) && Array.isArray(x.transactions)
  );
}

/**
 * Reads messages newer than `sinceId` (or from the last 12 hours on first run).
 * Returns packets from other devices plus the id to continue from next time.
 */
export async function pollPackets(
  syncCode: string,
  deviceId: string,
  sinceId: string | null
): Promise<{ packets: RelayPacket[]; lastId: string | null }> {
  const since = sinceId ? encodeURIComponent(sinceId) : '12h';
  const res = await fetch(`${topicUrl(syncCode)}/json?poll=1&since=${since}`);
  if (!res.ok) throw new Error(`Sync relay HTTP ${res.status}`);
  const text = await res.text();
  const packets: RelayPacket[] = [];
  let lastId = sinceId;

  const envelopes: any[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const env = JSON.parse(line);
      if (env.event === 'message') envelopes.push(env);
    } catch {
      // ignore malformed lines
    }
  }
  if (envelopes.length > 0) lastId = envelopes[envelopes.length - 1].id || lastId;

  // Every packet carries a device's full inventory, so the newest few are enough.
  for (const env of envelopes.slice(-15)) {
    let payload: any = null;
    try {
      if (typeof env.attachment?.url === 'string' && env.attachment.url.startsWith(`${RELAY_BASE}/`)) {
        const att = await fetch(env.attachment.url);
        if (att.ok) payload = await att.json();
      } else if (env.message) {
        payload = JSON.parse(env.message);
      }
    } catch {
      payload = null; // expired attachment or foreign message: skip
    }
    if (isPacket(payload) && payload.deviceId !== deviceId) packets.push(payload);
  }
  return { packets, lastId };
}
