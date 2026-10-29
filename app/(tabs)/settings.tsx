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
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { useInventory, MASTER_LICENSE_KEY } from '../../src/context/InventoryContext';

export const APP_VERSION = 'v2.3.0';
const CLIENT_LOCKED_DEMO_WEB_URL =
  'https://rickmaity07-maker.github.io/stock-qr-inventory-app/client-demo.html';

export default function SettingsScreen() {
  const {
    role,
    ownerPin,
    cloudConfig,
    isSyncing,
    lastSyncedAt,
    unsyncedCount,
    isClientDemoLocked,
    enableClientDemoLock,
    unlockClientDemo,
    switchToStaffRole,
    unlockOwnerRole,
    updateOwnerPin,
    updateCloudConfig,
    syncWithCloud,
    resetToDemoData,
    pullOnlineUpdateFromGitHub,
  } = useInventory();

  const [pinAttempt, setPinAttempt] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [supabaseUrl, setSupabaseUrl] = useState<string>(cloudConfig.supabaseUrl);
  const [supabaseKey, setSupabaseKey] = useState<string>(cloudConfig.supabaseAnonKey);
  const [autoSync, setAutoSync] = useState<boolean>(cloudConfig.autoSyncEnabled);
  const [checkingOta, setCheckingOta] = useState<boolean>(false);
  const [otaProgress, setOtaProgress] = useState<number>(0);
  const [otaStatusText, setOtaStatusText] = useState<string>('Check GitHub for the latest app version. Android will ask you to approve the install.');
  const [latestOnlineTag, setLatestOnlineTag] = useState<string | null>(null);

  const handleUnlockOwner = async () => {
    if (isClientDemoLocked) {
      const okDemo = await unlockClientDemo(pinAttempt);
      if (okDemo) {
        setPinAttempt('');
        Alert.alert('Full Version Unlocked', 'Client Demo lock removed and Owner Mode enabled.');
      } else {
        Alert.alert(
          '🔒 Client Preview Locked',
          'Enter the Developer Master License Key to unlock full Owner access.'
        );
      }
      return;
    }
    const ok = await unlockOwnerRole(pinAttempt);
    if (ok) {
      setPinAttempt('');
      Alert.alert('Owner Mode Active', 'Full access to buying prices, revenue, and profit unlocked.');
    } else {
      Alert.alert('Invalid PIN', 'Incorrect Owner PIN. Default PIN is 1234.');
    }
  };

  const handleUnlockClientDemo = async () => {
    const ok = await unlockClientDemo(licenseKeyInput);
    if (ok) {
      setLicenseKeyInput('');
      Alert.alert(
        'Full Mobile Store App Unlocked',
        'Client Demo restrictions have been removed.'
      );
    } else {
      Alert.alert(
        'Invalid License Key',
        'Incorrect license key. Contact the developer to unlock the full Mobile Store system.'
      );
    }
  };

  const handleChangePin = async () => {
    if (isClientDemoLocked) {
      Alert.alert('🔒 Locked in Client Preview', 'Changing Owner PIN is disabled in Client Demo mode.');
      return;
    }
    if (newPin.trim().length < 4) {
      Alert.alert('PIN Too Short', 'Please enter at least 4 digits for the Owner PIN.');
      return;
    }
    await updateOwnerPin(newPin);
    setNewPin('');
    Alert.alert('PIN Updated', 'Your Owner PIN has been updated.');
  };

  const handleSaveCloudSettings = async () => {
    if (isClientDemoLocked) {
      Alert.alert(
        '🔒 Locked in Client Preview',
        'Cloud database sync configuration is disabled in the Client Demo Preview.'
      );
      return;
    }
    await updateCloudConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseKey.trim(),
      autoSyncEnabled: autoSync,
    });
    const res = await syncWithCloud();
    Alert.alert(res.ok ? 'Live Sync Connected' : 'Saved Locally', res.message);
  };

  const handleCheckOnlineUpdate = async () => {
    setCheckingOta(true);
    setOtaProgress(18);
    setOtaStatusText('Connecting to Over-The-Air (OTA) update server...');
    try {
      await new Promise((r) => setTimeout(r, 350));
      setOtaProgress(55);
      setOtaStatusText('Checking the latest app version on GitHub...');

      // 1. Pull & apply live Mobile Store delta patch & QR connections in-place
      const liveRes = await pullOnlineUpdateFromGitHub();
      setLatestOnlineTag(liveRes.version);

      const versionParts = (version: string) =>
        version.replace(/^v/i, '').split('.').map((part) => Number(part) || 0);
      const latestParts = versionParts(liveRes.version);
      const installedParts = versionParts(APP_VERSION);
      let isNewerVersion = false;
      for (let index = 0; index < Math.max(latestParts.length, installedParts.length); index += 1) {
        const latestPart = latestParts[index] || 0;
        const installedPart = installedParts[index] || 0;
        if (latestPart !== installedPart) {
          isNewerVersion = latestPart > installedPart;
          break;
        }
      }

      if (Platform.OS === 'android' && isNewerVersion) {
        setOtaProgress(68);
        setOtaStatusText(`Downloading ${liveRes.version} from GitHub...`);
        const apkDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!apkDirectory) throw new Error('No local storage available for the APK download.');
        const apkUri = `${apkDirectory}stock-qr-inventory-${liveRes.version}.apk`;
        const download = await FileSystem.downloadAsync(liveRes.apkUrl, apkUri);
        if (download.status < 200 || download.status >= 300) {
          throw new Error(`APK download failed with HTTP ${download.status}`);
        }
        const contentUri = await FileSystem.getContentUriAsync(download.uri);
        setOtaProgress(95);
        setOtaStatusText('Opening Android installer...');
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.VIEW, {
          data: contentUri,
          type: 'application/vnd.android.package-archive',
          flags: 1,
        });
        setOtaProgress(100);
        setOtaStatusText(`Downloaded ${liveRes.version}. Approve the Android prompt to install.`);
        return;
      }

      setOtaProgress(88);
      setOtaStatusText('Checking for any configured Expo app update...');
      await new Promise((r) => setTimeout(r, 350));

      // 2. Also check Expo Over-The-Air (OTA) bundle updates if running in EAS
      if (!__DEV__) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
            return;
          }
        } catch {
          // Handled seamlessly by delta OTA engine above
        }
      }

      setOtaProgress(100);
      setOtaStatusText(`App is up to date (${liveRes.version}).`);
      Alert.alert('App is up to date', `${liveRes.version}\n\n${liveRes.notes}`);
    } catch (err: any) {
      setOtaProgress(100);
      setOtaStatusText('Could not check for updates. Try again when online.');
      Alert.alert('Update unavailable', err?.message || 'Could not download the update. Please try again.');
    } finally {
      setCheckingOta(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. CLIENT DEMO LOCK / PREVIEW MODE CONTROL */}
      <View style={[styles.card, isClientDemoLocked && styles.cardDemoLocked]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons
            name={isClientDemoLocked ? 'lock-closed' : 'shield-Half-outline' as any}
            size={20}
            color={isClientDemoLocked ? '#DC2626' : '#007AFF'}
          />
          <Text style={styles.cardTitle}>
            {isClientDemoLocked
              ? '🔒 Client Preview Mode (Locked)'
              : 'Client Showcase & Demo Lock'}
          </Text>
        </View>
        <Text style={styles.cardDesc}>
          {isClientDemoLocked
            ? 'This build is locked for client demonstration. Editing inventory, printing QR stickers, and exporting reports are blocked until unlocked with your Developer License Key.'
            : 'Showing the app to a potential client? Lock the app into "Blocked Client Preview Mode" or share the locked Client Demo link so they can see how it works without getting full access.'}
        </Text>

        {isClientDemoLocked ? (
          <View style={styles.pinUnlockRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Enter Developer Unlock Key"
              autoCapitalize="characters"
              value={licenseKeyInput}
              onChangeText={setLicenseKeyInput}
            />
            <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlockClientDemo}>
              <Text style={styles.unlockBtnText}>Unlock App</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              style={styles.lockDemoBtn}
              onPress={() => {
                enableClientDemoLock();
                Alert.alert(
                  '🔒 Client Demo Lock Enabled',
                  `The app is now in Blocked Client Preview Mode (watermarked, 3-scan limit, editing/printing/export blocked). Unlock anytime using key: ${MASTER_LICENSE_KEY} or PIN ${ownerPin}.`
                );
              }}
            >
              <Ionicons name="lock-closed-outline" size={17} color="#FFFFFF" />
              <Text style={styles.lockDemoBtnText}>
                Activate Blocked Client Demo Mode on This Phone
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryFullBtn}
              onPress={() => Linking.openURL(CLIENT_LOCKED_DEMO_WEB_URL)}
            >
              <Ionicons name="share-social-outline" size={17} color="#007AFF" />
              <Text style={styles.secondaryFullBtnText}>
                Open Shareable Blocked Client Web Link
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 2. AUTOMATIC OVER-THE-AIR (OTA) SOFTWARE UPDATES */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="cloud-done-outline" size={20} color="#007AFF" />
          <Text style={styles.cardTitle}>Install App Update</Text>
        </View>
        <Text style={styles.cardDesc}>
          Android downloads the latest signed APK from GitHub and opens the system installer. Approve the Android prompt to finish. Installed: {APP_VERSION} · Latest: {latestOnlineTag || 'Not checked'}.
        </Text>

        <View
          style={{
            backgroundColor: '#EAF3FF',
            borderWidth: 1,
            borderColor: '#BFDBFE',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#007AFF' }}>
            {otaStatusText}
          </Text>
          {otaProgress > 0 && (
            <View
              style={{
                height: 6,
                backgroundColor: '#DBEAFE',
                borderRadius: 3,
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${otaProgress}%`,
                  height: '100%',
                  backgroundColor: '#007AFF',
                }}
              />
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleCheckOnlineUpdate}
          disabled={checkingOta}
        >
          <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>
            {checkingOta
              ? 'Checking for App Update...'
              : 'Check & Install App Update'}
          </Text>
        </TouchableOpacity>

        {role === 'OWNER' && !isClientDemoLocked && (
          <TouchableOpacity
            style={styles.resetDemoBtn}
            onPress={() =>
              Alert.alert(
                'Reset Mobile Store Sample Inventory?',
                'Restore the default Mobile Phone Store products (iPhone 16 Pro Max, S24 Ultra, AirPods Pro, Chargers, Cases) and multi-month sales history?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset Mobile Data',
                    style: 'destructive',
                    onPress: resetToDemoData,
                  },
                ]
              )
            }
          >
            <Ionicons name="refresh-outline" size={16} color="#8E8E93" />
            <Text style={styles.resetDemoBtnText}>Restore Default Mobile Store Inventory</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. MULTIPLE USERS & ROLES */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="people-outline" size={20} color="#007AFF" />
          <Text style={styles.cardTitle}>Users & Role Permissions</Text>
        </View>
        <Text style={styles.cardDesc}>
          The Owner sees everything including buying prices, monthly revenue, and gross profit. Staff accounts can only sell, restock, and view stock.
        </Text>

        <View style={styles.roleStatusBox}>
          <View>
            <Text style={styles.roleLabel}>Active Device Role</Text>
            <Text style={styles.roleValue}>
              {isClientDemoLocked
                ? 'Client Demo (Blocked)'
                : role === 'OWNER'
                ? 'Owner (Full Access)'
                : 'Staff (Restricted)'}
            </Text>
          </View>

          {role === 'OWNER' && !isClientDemoLocked ? (
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

        {role === 'STAFF' || isClientDemoLocked ? (
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

      {/* 4. LIVE SYNC ACROSS DEVICES & OFFLINE SUPPORT */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="cloud-done-outline" size={20} color="#007AFF" />
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
          <Text style={styles.toggleLabel}>Real-Time Live Sync Across All Store Phones</Text>
          <Switch
            value={autoSync}
            onValueChange={setAutoSync}
            trackColor={{ false: '#D1D1D6', true: '#99F6E4' }}
            thumbColor={autoSync ? '#007AFF' : '#8E8E93'}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    borderColor: '#E5E5EA',
  },
  cardDemoLocked: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  cardDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 17,
  },
  roleStatusBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 12,
  },
  roleLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  roleValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
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
    color: '#3A3A3C',
    marginBottom: 5,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#1C1C1E',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  unlockBtn: {
    backgroundColor: '#007AFF',
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
  lockDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  lockDemoBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryBtn: {
    backgroundColor: '#F2F2F7',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  secondaryBtnText: {
    color: '#3A3A3C',
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
    backgroundColor: '#F2F2F7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  syncStatLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  syncStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
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
    color: '#3A3A3C',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
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
    backgroundColor: '#EAF3FF',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 8,
  },
  secondaryFullBtnText: {
    color: '#007AFF',
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
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
});
