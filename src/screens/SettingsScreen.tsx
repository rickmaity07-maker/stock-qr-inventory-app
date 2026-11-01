import React, { useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { APP_VERSION, useInventory } from '../context/InventoryContext';
import { CURRENCIES, CurrencyCode } from '../logic/money';
import { pickBackup, shareBackup } from '../services/backup';
import { api } from '../services/api';
import { Button, Field, IconTile, LargeTitle, Notice, Row, Screen, Section, Sheet } from '../ui/components';
import { confirmAction, showAlert } from '../ui/dialog';
import { space, usePalette } from '../ui/theme';

const CLIENT_DEMO_WEB_URL = 'https://rickmaity07-maker.github.io/stock-qr-inventory-app/client-demo.html';

type AuthMode = 'signin' | 'create' | 'reset';

const AUTH_TITLES: Record<AuthMode, { title: string; action: string }> = {
  signin: { title: 'Sign in', action: 'Sign in' },
  create: { title: 'Create owner account', action: 'Create account' },
  reset: { title: 'Reset password', action: 'Set new password' },
};

export default function SettingsScreen() {
  const c = usePalette();
  const inv = useInventory();
  const { account, serverConfigured, cloudConfig, isSyncing, lastSyncedAt, lastSyncError, unsyncedCount, isSampleData, isClientDemoLocked } = inv;

  const [licence, setLicence] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pwVisible, setPwVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [currencyVisible, setCurrencyVisible] = useState(false);

  // ---- account -------------------------------------------------------------

  const openAuth = async () => {
    setAuthError(null);
    setPassword('');
    setSetupKey('');
    let mode: AuthMode = 'signin';
    try {
      const { hasOwner } = await api.status();
      if (!hasOwner) mode = 'create';
    } catch {
      // offline or not reachable: default to sign in; the request will explain
    }
    setAuthMode(mode);
  };

  const submitAuth = async () => {
    if (!authMode || authBusy) return;
    setAuthError(null);
    if (!email.trim() || password.length < 8) {
      setAuthError('Enter your email and a password of at least 8 characters.');
      return;
    }
    if (authMode !== 'signin' && !setupKey.trim()) {
      setAuthError('Enter the setup key you were given.');
      return;
    }
    setAuthBusy(true);
    try {
      if (authMode === 'create') await inv.createOwnerAccount(setupKey, email, password);
      else if (authMode === 'reset') await inv.resetPassword(setupKey, email, password);
      else await inv.signIn(email, password);
      setAuthMode(null);
      setPassword('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async (everywhere: boolean) => {
    const ok = await confirmAction({
      title: everywhere ? 'Sign out on every device?' : 'Sign out on this phone?',
      message: everywhere
        ? 'All phones must sign in again. Use this if a phone was lost or stolen.'
        : 'Products and sales stay on this phone, but it stops syncing until you sign in again.',
      confirmText: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    try {
      await inv.signOut(everywhere);
    } catch (e) {
      showAlert('Could not sign out', e instanceof Error ? e.message : String(e));
    }
  };

  const savePassword = async () => {
    if (newPw.length < 8) {
      showAlert('Password too short', 'Use at least 8 characters.');
      return;
    }
    try {
      await inv.changePassword(currentPw, newPw);
      setPwVisible(false);
      setCurrentPw('');
      setNewPw('');
      showAlert('Password changed', 'Your other devices need to sign in again with the new password.');
    } catch (e) {
      showAlert('Password not changed', e instanceof Error ? e.message : String(e));
    }
  };

  const syncNow = async () => {
    const res = await inv.syncWithCloud();
    if (!res.ok) showAlert('Not synced', res.message);
  };

  // ---- preview lock ----------------------------------------------------------

  const unlockPreview = async () => {
    const ok = await inv.unlockClientDemo(licence);
    setLicence('');
    showAlert(ok ? 'Full version unlocked' : 'That key did not work', ok ? 'All features are available again.' : undefined);
  };

  const lockDemo = async () => {
    const ok = await confirmAction({
      title: 'Switch to preview mode?',
      message: 'For showing the app to someone: editing, printing and exports are locked and only 3 demo scans are allowed. Unlock with the licence key.',
      confirmText: 'Lock',
    });
    if (ok) await inv.enableClientDemoLock();
  };

  // ---- updates ----------------------------------------------------------------

  const checkUpdates = async () => {
    setChecking(true);
    setUpdateStatus('Checking…');
    try {
      if (Platform.OS === 'web') {
        const reg = await (globalThis as any).navigator?.serviceWorker?.getRegistration?.();
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
        const dl = await FileSystem.downloadAsync(info.apkUrl, `${dir}stock-qr-inventory-${info.latestVersion}.apk`);
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

  // ---- data ----------------------------------------------------------------------

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
      message: 'This removes the sample products and sales from this phone. This cannot be undone.',
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
    if (!ok) return;
    try {
      await inv.resetToDemoData();
    } catch (e) {
      showAlert('Not loaded', e instanceof Error ? e.message : String(e));
    }
  };

  const statusText = isSyncing
    ? 'Syncing…'
    : unsyncedCount > 0
    ? `${unsyncedCount} waiting to upload`
    : lastSyncedAt
    ? `Up to date · ${new Date(lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : 'Not synced yet';

  return (
    <Screen>
      <LargeTitle title="Settings" />

      {isClientDemoLocked ? (
        <Section header="Preview mode" footer="This phone is locked for showing the app. Enter the licence key to unlock it.">
          <Field label="Licence key" value={licence} onChangeText={setLicence} autoCapitalize="characters" autoCorrect={false} secureTextEntry onSubmitEditing={unlockPreview} />
          <Row title="Unlock" tinted disabled={!licence.trim()} onPress={unlockPreview} />
        </Section>
      ) : null}

      {/* Account & sync */}
      {account ? (
        <Section header="Cloud account" footer="Every phone signed in to this account shares the same products, stock and sales. Selling works offline and catches up automatically.">
          <Row title={account.email} subtitle="Signed in" left={<IconTile name="cloud-done" color={c.green} />} />
          <Row title="Status" value={statusText} />
          <Row title="Sync now" tinted onPress={syncNow} disabled={isSyncing} />
          <Row
            title="Automatic sync"
            right={
              <Switch
                value={cloudConfig.autoSyncEnabled}
                onValueChange={(on) => inv.updateCloudConfig({ autoSyncEnabled: on })}
                trackColor={{ true: c.green, false: c.fillStrong }}
                thumbColor="#FFFFFF"
                {...({ activeThumbColor: '#FFFFFF' } as object)}
              />
            }
          />
          <Row title="Change password" chevron onPress={() => setPwVisible(true)} />
          <Row title="Sign out on this phone" destructive onPress={() => signOut(false)} />
          <Row title="Sign out on every device" destructive onPress={() => signOut(true)} />
        </Section>
      ) : (
        <Section
          header="Cloud account"
          footer={
            serverConfigured
              ? 'Sign in on each of your phones to keep stock and sales in sync and safely backed up online.'
              : 'This build has no cloud server configured, so data stays on this phone.'
          }
        >
          <Row title="Not signed in" subtitle="Data is saved on this phone only" left={<IconTile name="cloud-offline" color={c.gray} />} />
          {serverConfigured && !isClientDemoLocked ? <Row title="Sign in" tinted chevron onPress={openAuth} /> : null}
        </Section>
      )}
      {lastSyncError ? <Notice tone="orange" icon="cloud-offline-outline" title="Last sync did not finish" message={lastSyncError} /> : null}

      {/* App */}
      <Section header="App" footer={updateStatus || undefined}>
        <Row title="Version" value={APP_VERSION} />
        <Row title={checking ? 'Checking…' : 'Check for updates'} tinted onPress={checkUpdates} disabled={checking} />
      </Section>

      {/* Data */}
      {!isClientDemoLocked ? (
        <Section
          header="Data"
          footer={
            isSampleData
              ? 'This phone has sample products. Start fresh when you are ready to enter your own (signing in also removes them).'
              : 'A backup file holds every product and sale. Keep one somewhere safe, e.g. iCloud Drive or Google Drive.'
          }
        >
          {isSampleData ? <Row title="Start my own store" tinted onPress={startFresh} /> : null}
          <Row title="Currency" value={CURRENCIES[inv.currency].label} chevron onPress={() => setCurrencyVisible(true)} />
          <Row title="Back up inventory" left={<Ionicons name="cloud-download-outline" size={20} color={c.tint} />} tinted onPress={backupNow} />
          <Row title="Restore from backup" left={<Ionicons name="folder-open-outline" size={20} color={c.tint} />} tinted onPress={restoreFromFile} />
          {!account ? <Row title="Load sample data" destructive onPress={restoreSample} /> : null}
        </Section>
      ) : null}

      {/* Showing someone */}
      {!isClientDemoLocked ? (
        <Section header="Showing a client" footer="Preview mode locks editing, printing and exports, and allows 3 demo scans.">
          <Row title="Lock this phone in preview mode" left={<Ionicons name="lock-closed-outline" size={20} color={c.tint} />} tinted onPress={lockDemo} />
          <Row title="Open the web demo link" left={<Ionicons name="share-outline" size={20} color={c.tint} />} tinted onPress={() => Linking.openURL(CLIENT_DEMO_WEB_URL)} />
        </Section>
      ) : null}

      {/* Sign in / create account */}
      <Sheet
        visible={Boolean(authMode)}
        title={AUTH_TITLES[authMode ?? 'signin'].title}
        onClose={() => setAuthMode(null)}
        action={{ label: authMode === 'create' ? 'Create' : authMode === 'reset' ? 'Save' : 'Sign in', onPress: submitAuth, loading: authBusy }}
      >
        <Section
          footer={
            authMode === 'create'
              ? 'First time only: this creates the one owner account for your shop. You need the setup key from your developer.'
              : authMode === 'reset'
              ? 'Enter the setup key you used to create the account and choose a new password. Every other phone will need to sign in again. Your stock and sales are not affected.'
              : isSampleData
              ? 'The sample products on this phone are removed when you sign in.'
              : 'Products and sales already on this phone are uploaded to your account.'
          }
        >
          {authMode === 'create' || authMode === 'reset' ? (
            <Field label="Setup key" value={setupKey} onChangeText={setSetupKey} autoCapitalize="characters" autoCorrect={false} placeholder="XXXXXXXX-XXXXXXXX" />
          ) : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" />
          <Field
            label={authMode === 'reset' ? 'New password' : 'Password'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={authMode === 'signin' ? 'password' : 'newPassword'}
            autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
            hint={authMode === 'signin' ? undefined : 'At least 8 characters'}
            onSubmitEditing={submitAuth}
          />
        </Section>
        {authError ? <Notice tone="red" icon="alert-circle-outline" title={authError} /> : null}
        <View style={{ padding: space.lg }}>
          <Button title={AUTH_TITLES[authMode ?? 'signin'].action} onPress={submitAuth} loading={authBusy} />
          {authMode === 'signin' ? (
            <>
              <Button
                title="Forgot password?"
                variant="plain"
                size="medium"
                onPress={() => {
                  setAuthError(null);
                  setPassword('');
                  setAuthMode('reset');
                }}
                style={{ marginTop: space.sm }}
              />
              <Button title="First time? Create the owner account" variant="plain" size="medium" onPress={() => setAuthMode('create')} />
            </>
          ) : (
            <Button
              title="Back to sign in"
              variant="plain"
              size="medium"
              onPress={() => {
                setAuthError(null);
                setAuthMode('signin');
              }}
              style={{ marginTop: space.sm }}
            />
          )}
        </View>
      </Sheet>

      {/* Change password */}
      <Sheet visible={pwVisible} title="Change password" onClose={() => setPwVisible(false)} action={{ label: 'Save', onPress: savePassword }}>
        <Section footer="Other phones will need to sign in again with the new password.">
          <Field label="Current password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry textContentType="password" />
          <Field label="New password" value={newPw} onChangeText={setNewPw} secureTextEntry textContentType="newPassword" hint="At least 8 characters" />
        </Section>
      </Sheet>

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
    </Screen>
  );
}
