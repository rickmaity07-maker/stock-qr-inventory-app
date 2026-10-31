import React, { createContext, useContext } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../context/InventoryContext';
import { Tap } from './components';
import { type, usePalette } from './theme';

export type TabKey = 'scan' | 'products' | 'stock' | 'profit' | 'settings';

export const TabContext = createContext<{ tab: TabKey; setTab: (t: TabKey) => void }>({
  tab: 'scan',
  setTab: () => {},
});

export const useTabs = () => useContext(TabContext);

/** Small cloud status shown next to each large title; tap to open sync settings. */
export function SyncIndicator() {
  const c = usePalette();
  const { setTab } = useTabs();
  const { syncMode, isSyncing, unsyncedCount, lastSyncError } = useInventory();

  let icon: keyof typeof Ionicons.glyphMap = 'cloud-done-outline';
  let color = c.green;
  let label = 'Synced';
  if (syncMode === 'off') {
    icon = 'cloud-offline-outline';
    color = c.secondaryLabel;
    label = 'This phone only';
  } else if (lastSyncError || unsyncedCount > 0) {
    icon = 'cloud-upload-outline';
    color = c.orange;
    label = unsyncedCount > 0 ? `${unsyncedCount} waiting` : 'Offline';
  }

  return (
    <Tap
      onPress={() => setTab('settings')}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Open sync settings.`}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 8 }}
    >
      {isSyncing ? <ActivityIndicator size="small" color={c.secondaryLabel} /> : <Ionicons name={icon} size={18} color={color} />}
      <Text style={[type.caption1, { color: c.secondaryLabel }]}>{label}</Text>
    </Tap>
  );
}

export function LoadingView() {
  const c = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
      <ActivityIndicator color={c.secondaryLabel} />
    </View>
  );
}
