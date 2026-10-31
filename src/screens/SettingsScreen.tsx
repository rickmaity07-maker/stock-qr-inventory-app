import React, { useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { APP_VERSION, useInventory } from '../context/InventoryContext';
import { DesignerQrCode } from '../components/DesignerQrCode';
import { buildPairingPayload } from '../logic/inventoryLogic';
import { CURRENCIES, CurrencyCode } from '../logic/money';
import { pickBackup, shareBackup } from '../services/backup';
import {
  Button,
  Field,
  IconTile,
  LargeTitle,
  Notice,
  Row,
  Screen,
  Section,
  Sheet,
} from '../ui/components';
import { confirmAction, showAlert } from '../ui/dialog';
import { radius, space, type, usePalette } from '../ui/theme';

const CLIENT_DEMO_WEB_URL = 'https://rickmaity07-maker.github.io/stock-qr-inventory-app/client-demo.html';

export default function SettingsScreen() {
  const c = usePalette();
  const inv = useInventory();
  const {
    role,
    pinIsDefault,
    pinLockedUntil,
    cloudConfig,
    syncMode,
    syncCode,
    isSyncing,
    lastSyncedAt,
    lastSyncError,
    unsyncedCount,
    isSampleData,
    isClientDemoLocked,
  } = inv;
  const isOwner = role === 'OWNER' && !isClientDemoLocked;

  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pairVisible, setPairVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [cloudVisible, setCloudVisible] = useState(false);
  const [url, setUrl] = useState(cloudConfig.supabaseUrl);
  const [key, setKey] = useState(cloudConfig.supabaseAnonKey);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [currencyVisible, setCurrencyVisible] = useState(false);

  // ---- roles -------------------------------------------------------------

  const unlockOwner = async () => {
    if (isClientDemoLocked) {
      const ok = await inv.unlockClientDemo(pin);
      setPin('');
      showAlert(ok ? 'Full version unlocked' : 'That key did not work', ok ? 'Owner mode is on.' : undefined);
      return;
    }
    const res = await inv.unlockOwnerRole(pin);
    setPin('');
    if (res === 'wrong') showAlert('Wrong PIN', 'Try again.');
    if (res === 'locked') showAlert('Too many attempts', 'Wait 30 seconds and try again.');
  };

  const changePin = async () => {
    try {
      await inv.updateOwnerPin(newPin);
      setNewPin('');
      showAlert('PIN updated', 'Use the new PIN next time you unlock owner mode.');
    } catch (e) {
      showAlert('PIN not changed', e instanceof Error ? e.message : String(e));
    }
  };

  // ---- sync --------------------------------------------------------------

  const syncNow = async () => {
    const res = await inv.syncWithCloud();
    showAlert(res.ok ? 'Synced' : 'Not synced', res.message);
  };

  const toggleAutoSync = (on: boolean) => inv.updateCloudConfig({ ...cloudConfig, autoSyncEnabled: on });

  const join = async () => {
    const res = await inv.joinStoreSync(joinCode);
    if (res.ok) {
      setJoinVisible(false);
      setJoinCode('');
    }
    showAlert(res.ok ? 'Phone paired' : 'Could not pair', res.message);
  };

  const resetPairing = async () => {
    const ok = await confirmAction({
      title: 'Create a new store code?',
      message: 'Phones paired with the old code stop receiving updates until you pair them again. Use this if a phone was lost.',
      confirmText: 'New code',
      destructive: true,
    });
    if (ok) await inv.createNewSyncCode();
  };

  const saveCloud = async () => {
    if (url.trim() && !/^https:\/\//i.test(url.trim())) {
      showAlert('Check the URL', 'The Supabase project URL starts with https://');
      return;
    }
    await inv.updateCloudConfig({ supabaseUrl: url, supabaseAnonKey: key, autoSyncEnabled: cloudConfig.autoSyncEnabled });
    setCloudVisible(false);
    if (url.trim() && key.trim()) {
      const res = await inv.syncWithCloud();
      showAlert(res.ok ? 'Supabase connected' : 'Saved, but not synced yet', res.message);
    }
  };

  // ---- updates -----------------------------------------------------------

  const checkUpdates = async () => {
    setChecking(true);
    setUpdateStatus('Checking…');
    try {
      if (Platform.OS === 'web') {
        const sw = (globalThis as any).navigator?.serviceWorker;
        const reg = await sw?.getRegistration?.();
        await reg?.update?.();
        setUpdateStatus('Reloading with the latest version…');
        (globalThis as any).location?.reload();
        return;
      }
      const info = await inv.checkForAppUpdate();
      if (Platform.OS === 'android' && info.isNewer && info.apkUrl) {
        const go = await confirmAction({
          title: `Install ${info.latestVersion}?`,
          message: info.notes || 'A newer version is available.',
          confirmText: 'Download',
        });
        if (!go) {
          setUpdateStatus(`${info.latestVersion} is available.`);
          return;
        }
        setUpdateStatus(`Downloading ${info.latestVersion}…`);
        const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!dir) throw new Error('No storage available for the download.');
        const target = `${dir}stock-qr-inventory-${info.latestVersion}.apk`;
        const dl = await FileSystem.downloadAsync(info.apkUrl, target);
        if (dl.status < 200 || dl.status >= 300) throw new Error(`Download failed (HTTP ${dl.status}).`);
        const contentUri = await FileSystem.getContentUriAsync(dl.uri);
        setUpdateStatus('Approve the Android prompt to finish installing.');
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'application/vnd.android.package-archive',
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
        return;
      }
      if (!__DEV__ && Updates.isEnabled) {
        const res = await Updates.checkForUpdateAsync().catch(() => null);
        if (res?.isAvailable) {
          setUpdateStatus('Applying update…');
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      }
      setUpdateStatus(`You have the latest version (${APP_VERSION}).`);
    } catch (e) {
      setUpdateStatus(e instanceof Error ? e.message : 'Could not check for updates.');
    } finally {
      setChecking(false);
    }
  };

  // ---- data --------------------------------------------------------------

  const backupNow = async () => {
    try {
      await shareBackup(inv.makeBackup());
    } catch (e) {
      showAlert('Backup failed', e instanceof Error ? e.message : String(e));
    }
  };

  const restoreFromFile = async () => {
    try {
      const backup = await pickBackup();
      if (!backup) return;
      const ok = await confirmAction({
        title: 'Restore this backup?',
        message: `${backup.products.length} products and ${backup.transactions.length} sales/restocks from ${new Date(backup.exportedAt).toLocaleDateString('en-GB')}. They are added to what is on this phone — nothing is deleted.`,
        confirmText: 'Restore',
      });
      if (!ok) return;
      const res = await inv.restoreBackup(backup);
      showAlert('Backup restored', `${res.products} products and ${res.transactions} records merged.`);
    } catch (e) {
      showAlert('Could not restore', e instanceof Error ? e.message : String(e));
    }
  };

  const startFresh = async () => {
    const ok = await confirmAction({
      title: 'Start your own store?',
      message: 'This removes the sample products and sales from this phone and gives the store a new pairing code. This cannot be undone.',
      confirmText: 'Start fresh',
      destructive: true,
    });
    if (ok) await inv.startFreshStore();
  };

  const restoreSample = async () => {
    const ok = await confirmAction({
      title: 'Load sample data?',
      message: 'Replaces everything on this phone with the sample phone-shop catalogue. Use it for demos only.',
      confirmText: 'Load sample',
      destructive: true,
    });
    if (ok) await inv.resetToDemoData();
  };

  const lockDemo = async () => {
    const ok = await confirmAction({
      title: 'Switch to preview mode?',
      message: 'For showing the app to a client: editing, printing and exports are locked and only 3 demo scans are allowed. Unlock later with the owner PIN.',
      confirmText: 'Lock',
    });
    if (ok) await inv.enableClientDemoLock();
  };

  const syncSubtitle =
    syncMode === 'supabase'
      ? 'Supabase database'
      : syncMode === 'relay'
      ? 'Paired phones (automatic)'
      : 'Off — this phone only';

  return (
    <Screen>
      <LargeTitle title="Settings" />

      {isOwner && pinIsDefault ? (
        <Notice tone="orange" icon="key-outline" title="Change the owner PIN" message="The PIN is still the default 1234, so anyone can see profit and buying prices." />
      ) : null}

      {/* Access */}
      <Section header="Access" footer="The owner sees buying prices, profit and reports. Staff can sell, restock and view stock.">
        <Row
          title={isClientDemoLocked ? 'Preview mode' : role === 'OWNER' ? 'Owner' : 'Staff'}
          subtitle="This phone's role"
          left={<IconTile name={role === 'OWNER' && !isClientDemoLocked ? 'shield-checkmark' : 'person'} color={role === 'OWNER' && !isClientDemoLocked ? c.indigo : c.gray} />}
        />
        {isOwner ? (
          <>
            <Row title="Switch to staff mode" tinted onPress={inv.switchToStaffRole} />
            <Field label="New owner PIN (4–8 digits)" value={newPin} onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <Row title="Save new PIN" tinted disabled={newPin.length < 4} onPress={changePin} />
          </>
        ) : (
          <>
            <Field
              label={isClientDemoLocked ? 'Licence key or owner PIN' : 'Owner PIN'}
              value={pin}
              onChangeText={setPin}
              keyboardType={isClientDemoLocked ? 'default' : 'number-pad'}
              autoCapitalize="characters"
              secureTextEntry
              onSubmitEditing={unlockOwner}
            />
            <Row title={Date.now() < pinLockedUntil ? 'Try again in a moment' : 'Unlock'} tinted disabled={!pin || Date.now() < pinLockedUntil} onPress={unlockOwner} />
          </>
        )}
      </Section>

      {/* Sync */}
      <Section
        header="Sync between phones"
        footer={
          syncMode === 'relay'
            ? 'Every change is shared within seconds with phones paired to this store. Scanning keeps working offline and catches up later.'
            : undefined
        }
      >
        <Row title="Sync" subtitle={syncSubtitle} left={<IconTile name="sync" color={c.green} />} />
        <Row
          title="Automatic sync"
          right={<Switch value={cloudConfig.autoSyncEnabled} onValueChange={toggleAutoSync} disabled={!isOwner} trackColor={{ true: c.green, false: c.fillStrong }} thumbColor="#FFFFFF" {...({ activeThumbColor: "#FFFFFF" } as object)} />}
        />
        <Row
          title="Status"
          value={
            isSyncing
              ? 'Syncing…'
              : unsyncedCount > 0
              ? `${unsyncedCount} waiting`
              : lastSyncedAt
              ? `Up to date ${new Date(lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : 'Not synced yet'
          }
        />
        {syncMode !== 'off' ? <Row title="Sync now" tinted onPress={syncNow} disabled={isSyncing} /> : null}
        {isOwner && syncMode !== 'supabase' ? (
          <>
            <Row title="Show pairing code" subtitle="Scan it from another phone to share this store" chevron onPress={() => setPairVisible(true)} />
            <Row title="Pair with another store" subtitle="Enter or scan the other phone's code" chevron onPress={() => setJoinVisible(true)} />
          </>
        ) : null}
        {isOwner ? (
          <Row title="Supabase database (advanced)" value={syncMode === 'supabase' ? 'On' : 'Off'} chevron onPress={() => setCloudVisible(true)} />
        ) : null}
      </Section>
      {lastSyncError ? (
        <Notice tone="orange" icon="cloud-offline-outline" title="Last sync failed" message={lastSyncError} />
      ) : null}

      {/* Updates */}
      <Section header="App" footer={updateStatus || undefined}>
        <Row title="Version" value={APP_VERSION} />
        <Row title={checking ? 'Checking…' : 'Check for updates'} tinted onPress={checkUpdates} disabled={checking} />
      </Section>

      {/* Data */}
      {isOwner ? (
        <Section
          header="Data"
          footer={
            isSampleData
              ? 'This phone has sample products. Start fresh when you are ready to enter your own.'
              : 'A backup file holds every product and sale. Keep one somewhere safe, e.g. iCloud Drive or Google Drive.'
          }
        >
          {isSampleData ? <Row title="Start my own store" tinted onPress={startFresh} /> : null}
          <Row title="Currency" value={CURRENCIES[inv.currency].label} chevron onPress={() => setCurrencyVisible(true)} />
          <Row title="Back up inventory" left={<Ionicons name="cloud-download-outline" size={20} color={c.tint} />} tinted onPress={backupNow} />
          <Row title="Restore from backup" left={<Ionicons name="folder-open-outline" size={20} color={c.tint} />} tinted onPress={restoreFromFile} />
          <Row title="Load sample data" destructive onPress={restoreSample} />
        </Section>
      ) : null}

      {/* Client preview */}
      {isOwner ? (
        <Section header="Showing a client" footer="Preview mode locks editing, printing and exports, and allows 3 demo scans.">
          <Row title="Lock this phone in preview mode" left={<Ionicons name="lock-closed-outline" size={20} color={c.tint} />} tinted onPress={lockDemo} />
          <Row title="Open the web demo link" left={<Ionicons name="share-outline" size={20} color={c.tint} />} tinted onPress={() => Linking.openURL(CLIENT_DEMO_WEB_URL)} />
        </Section>
      ) : null}

      {/* Currency */}
      <Sheet visible={currencyVisible} title="Currency" onClose={() => setCurrencyVisible(false)} closeLabel="Done">
        <Section footer="Changes how prices are shown and exported. Stored amounts are not converted.">
          {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
            <Row
              key={code}
              title={CURRENCIES[code].label}
              onPress={() => {
                inv.setCurrency(code);
                setCurrencyVisible(false);
              }}
              right={inv.currency === code ? <Ionicons name="checkmark" size={20} color={c.tint} /> : undefined}
            />
          ))}
        </Section>
      </Sheet>

      {/* Pairing code sheet */}
      <Sheet visible={pairVisible} title="Pairing code" onClose={() => setPairVisible(false)} closeLabel="Done">
        <View style={{ alignItems: 'center', padding: space.xl, gap: space.md }}>
          <View style={{ backgroundColor: '#FFFFFF', padding: space.md, borderRadius: radius.xl }}>
            <DesignerQrCode value={buildPairingPayload(syncCode)} size={230} />
          </View>
          <Text style={[type.subhead, { color: c.secondaryLabel, textAlign: 'center' }]}>
            On the other phone, open Scan and point it at this code. It will ask to join this store.
          </Text>
          <Text selectable style={[type.footnote, { color: c.tertiaryLabel, textAlign: 'center' }]}>
            {syncCode}
          </Text>
        </View>
        <Section footer="Only share this code with your own staff — anyone who has it can see and change this store's stock.">
          <Row title="Create a new code" destructive onPress={resetPairing} />
        </Section>
      </Sheet>

      {/* Join sheet */}
      <Sheet
        visible={joinVisible}
        title="Pair with store"
        onClose={() => setJoinVisible(false)}
        action={{ label: 'Pair', onPress: join, disabled: joinCode.trim().length < 20 }}
      >
        <Section footer="Easiest: open the Scan tab and scan the pairing QR shown on the other phone. Or type the code shown under it.">
          <Field label="Store code" value={joinCode} onChangeText={setJoinCode} autoCapitalize="none" autoCorrect={false} placeholder="e.g. k3f9…" />
        </Section>
      </Sheet>

      {/* Supabase sheet */}
      <Sheet visible={cloudVisible} title="Supabase" onClose={() => setCloudVisible(false)} action={{ label: 'Save', onPress: saveCloud }}>
        <Section footer="Optional. Use your own Supabase project instead of automatic pairing. Run supabase/schema.sql in its SQL editor first. Leave both empty to switch back to automatic pairing.">
          <Field label="Project URL" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://xyz.supabase.co" />
          <Field label="Anon key" value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="eyJ…" />
        </Section>
        <View style={{ padding: space.lg }}>
          <Button title="Save and sync" onPress={saveCloud} />
        </View>
      </Sheet>
    </Screen>
  );
}
