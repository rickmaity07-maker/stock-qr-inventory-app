import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useInventory } from '../../src/context/InventoryContext';

export default function SettingsScreen() {
  const {
    role,
    ownerPin,
    cloudConfig,
    isSyncing,
    lastSyncedAt,
    unsyncedCount,
    switchToStaffRole,
    unlockOwnerRole,
    updateOwnerPin,
    updateCloudConfig,
    syncWithCloud,
    resetToDemoData,
  } = useInventory();

  const [pinAttempt, setPinAttempt] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [supabaseUrl, setSupabaseUrl] = useState<string>(cloudConfig.supabaseUrl);
  const [supabaseKey, setSupabaseKey] = useState<string>(cloudConfig.supabaseAnonKey);
  const [autoSync, setAutoSync] = useState<boolean>(cloudConfig.autoSyncEnabled);
  const [checkingOta, setCheckingOta] = useState<boolean>(false);

  const handleUnlockOwner = async () => {
    const ok = await unlockOwnerRole(pinAttempt);
    if (ok) {
      setPinAttempt('');
      Alert.alert('Owner Mode Active', 'Full access to buying prices, revenue, and profit unlocked.');
    } else {
      Alert.alert('Invalid PIN', 'Incorrect Owner PIN. Default PIN is 1234.');
    }
  };

  const handleChangePin = async () => {
    if (newPin.trim().length < 4) {
      Alert.alert('PIN Too Short', 'Please enter at least 4 digits for the Owner PIN.');
      return;
    }
    await updateOwnerPin(newPin);
    setNewPin('');
    Alert.alert('PIN Updated', 'Your Owner PIN has been updated.');
  };

  const handleSaveCloudSettings = async () => {
    await updateCloudConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseKey.trim(),
      autoSyncEnabled: autoSync,
    });
    const res = await syncWithCloud();
    Alert.alert(res.ok ? 'Live Sync Connected' : 'Saved Locally', res.message);
  };

  const handleCheckOtaUpdate = async () => {
    setCheckingOta(true);
    try {
      if (__DEV__) {
        setCheckingOta(false);
        Alert.alert(
          'OTA Updates Ready',
          'Over-the-air updates (expo-updates) are configured. In production APK/Play Store builds, fixes and improvements download automatically without reinstalling.'
        );
        return;
      }
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        Alert.alert('Up to Date', 'You are running the latest version of the app.');
      }
    } catch (err: any) {
      Alert.alert('Update Check', err?.message || 'Unable to check for updates right now.');
    } finally {
      setCheckingOta(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. MULTIPLE USERS & ROLES */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="people-outline" size={20} color="#0F766E" />
          <Text style={styles.cardTitle}>Users & Role Permissions</Text>
        </View>
        <Text style={styles.cardDesc}>
          The Owner sees everything including buying prices, monthly revenue, and gross profit. Staff accounts can only sell, restock, and view stock.
        </Text>

        <View style={styles.roleStatusBox}>
          <View>
            <Text style={styles.roleLabel}>Active Device Role</Text>
            <Text style={styles.roleValue}>
              {role === 'OWNER' ? 'Owner (Full Access)' : 'Staff (Restricted)'}
            </Text>
          </View>

          {role === 'OWNER' ? (
            <TouchableOpacity style={styles.switchStaffBtn} onPress={switchToStaffRole}>
              <Ionicons name="lock-closed-outline" size={16} color="#FFFFFF" />
              <Text style={styles.switchStaffBtnText}>Switch to Staff Mode</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.staffBadge}>
              <Text style={styles.staffBadgeText}>Profit Hidden</Text>
            </View>
          )}
        </View>

        {role === 'STAFF' ? (
          <View style={styles.pinUnlockRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Owner PIN (Default: 1234)"
              keyboardType="number-pad"
              secureTextEntry
              value={pinAttempt}
              onChangeText={setPinAttempt}
            />
            <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlockOwner}>
              <Text style={styles.unlockBtnText}>Unlock Owner</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pinUnlockRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder={`New Owner PIN (Current: ${ownerPin})`}
              keyboardType="number-pad"
              value={newPin}
              onChangeText={setNewPin}
            />
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleChangePin}>
              <Text style={styles.secondaryBtnText}>Update PIN</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 2. LIVE SYNC ACROSS DEVICES & OFFLINE SUPPORT */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="cloud-done-outline" size={20} color="#0F766E" />
          <Text style={styles.cardTitle}>Live Sync & Offline Queue</Text>
        </View>
        <Text style={styles.cardDesc}>
          Scanning keeps working without internet. Everything saves on the device and syncs automatically via Supabase (PostgreSQL) once connected.
        </Text>

        <View style={styles.syncStatsRow}>
          <View style={styles.syncStatBox}>
            <Text style={styles.syncStatLabel}>Offline Queue</Text>
            <Text style={styles.syncStatVal}>{unsyncedCount} pending</Text>
          </View>
          <View style={styles.syncStatBox}>
            <Text style={styles.syncStatLabel}>Last Cloud Sync</Text>
            <Text style={styles.syncStatVal}>
              {lastSyncedAt
                ? new Date(lastSyncedAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Local Offline Mode'}
            </Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Supabase Project URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://your-project.supabase.co"
          autoCapitalize="none"
          value={supabaseUrl}
          onChangeText={setSupabaseUrl}
        />

        <Text style={styles.fieldLabel}>Supabase Anon Public Key</Text>
        <TextInput
          style={styles.input}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
          autoCapitalize="none"
          secureTextEntry
          value={supabaseKey}
          onChangeText={setSupabaseKey}
        />

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Real-Time Live Sync Across All Phones</Text>
          <Switch
            value={autoSync}
            onValueChange={setAutoSync}
            trackColor={{ false: '#CBD5E1', true: '#99F6E4' }}
            thumbColor={autoSync ? '#0F766E' : '#64748B'}
          />
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSaveCloudSettings}
          disabled={isSyncing}
        >
          <Ionicons name="sync-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>
            {isSyncing ? 'Syncing with Cloud...' : 'Save & Sync Now'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. AUTOMATIC APP UPDATES (OTA) & DEMO RESET */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="rocket-outline" size={20} color="#0F766E" />
          <Text style={styles.cardTitle}>Over-The-Air (OTA) App Updates</Text>
        </View>
        <Text style={styles.cardDesc}>
          Fixes and improvements are delivered over the air via Expo Updates so the Android app updates itself without reinstalling.
        </Text>

        <TouchableOpacity
          style={styles.secondaryFullBtn}
          onPress={handleCheckOtaUpdate}
          disabled={checkingOta}
        >
          <Ionicons name="cloud-download-outline" size={18} color="#0F766E" />
          <Text style={styles.secondaryFullBtnText}>
            {checkingOta ? 'Checking...' : 'Check for App Updates'}
          </Text>
        </TouchableOpacity>

        {role === 'OWNER' && (
          <TouchableOpacity
            style={styles.resetDemoBtn}
            onPress={() =>
              Alert.alert(
                'Reset Sample Inventory?',
                'Restore the initial sample products and multi-month sales history?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset Data',
                    style: 'destructive',
                    onPress: resetToDemoData,
                  },
                ]
              )
            }
          >
            <Ionicons name="refresh-outline" size={16} color="#64748B" />
            <Text style={styles.resetDemoBtnText}>Restore Default Demo Inventory</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 17,
  },
  roleStatusBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  roleLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  roleValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  switchStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  switchStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  staffBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  staffBadgeText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
  },
  pinUnlockRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 10,
  },
  unlockBtn: {
    backgroundColor: '#0F766E',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryBtn: {
    backgroundColor: '#F1F5F9',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },
  syncStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  syncStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  syncStatLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  syncStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0F766E',
    gap: 8,
  },
  secondaryFullBtnText: {
    color: '#0F766E',
    fontWeight: '800',
    fontSize: 13,
  },
  resetDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 8,
    gap: 6,
  },
  resetDemoBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
});
