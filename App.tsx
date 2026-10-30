import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { InventoryProvider, useInventory } from './src/context/InventoryContext';
import ScannerScreen from './app/(tabs)/index';
import ProductsScreen from './app/(tabs)/products';
import StockScreen from './app/(tabs)/stock';
import DashboardScreen from './app/(tabs)/dashboard';
import SettingsScreen from './app/(tabs)/settings';

type ActiveTab = 'scan' | 'products' | 'stock' | 'dashboard' | 'settings';

function MainShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');
  const [unlockModalVisible, setUnlockModalVisible] = useState<boolean>(false);
  const [licenseInput, setLicenseInput] = useState<string>('');

  const {
    role,
    lowStockProducts,
    cloudConfig,
    unsyncedCount,
    isClientDemoLocked,
    demoActionsRemaining,
    unlockClientDemo,
  } = useInventory();

  const lowStockCount = lowStockProducts.length;
  const isCloudConfigured = Boolean(cloudConfig.supabaseUrl && cloudConfig.supabaseAnonKey);

  const tabTitles: Record<ActiveTab, string> = {
    scan: 'Mobile Store QR Scanner',
    products: 'Mobile Catalogue & QR',
    stock: 'Stock & Supplier Reorder',
    dashboard: 'Revenue & Gross Profit',
    settings: 'Roles, Sync & Updates',
  };

  const handleUnlockSubmit = async () => {
    const ok = await unlockClientDemo(licenseInput);
    if (ok) {
      setLicenseInput('');
      setUnlockModalVisible(false);
      Alert.alert(
        'Full Version Unlocked',
        'Client Demo restrictions removed. All Mobile Store Inventory features are now unlocked.'
      );
    } else {
      Alert.alert(
        'Invalid License Key',
        'Please contact the developer to purchase the full store license key.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* TOP HEADER BAR — Apple iOS HIG Navigation Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Ionicons name="qr-code" size={16} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>APPLE RETAIL STUDIO</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {tabTitles[activeTab]}
            </Text>
          </View>
        </View>

        <View style={styles.headerRightContainer}>
          <View
            style={[
              styles.syncPill,
              isCloudConfigured ? styles.syncPillOnline : styles.syncPillOffline,
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: isCloudConfigured ? '#34C759' : '#FF9500' },
              ]}
            />
            <Text
              style={[
                styles.syncText,
                { color: isCloudConfigured ? '#248A3D' : '#C93400' },
              ]}
            >
              {isCloudConfigured
                ? unsyncedCount > 0
                  ? `Sync (${unsyncedCount})`
                  : 'Live Sync'
                : 'Offline Ready'}
            </Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              isClientDemoLocked
                ? styles.roleDemoLocked
                : role === 'OWNER'
                ? styles.roleOwner
                : styles.roleStaff,
            ]}
          >
            <Ionicons
              name={
                isClientDemoLocked
                  ? 'lock-closed'
                  : role === 'OWNER'
                  ? 'shield-checkmark'
                  : 'person'
              }
              size={11}
              color="#FFFFFF"
            />
            <Text style={styles.roleText}>
              {isClientDemoLocked ? 'DEMO' : role}
            </Text>
          </View>
        </View>
      </View>

      {/* BLOCKED CLIENT DEMO MODE BANNER */}
      {isClientDemoLocked && (
        <TouchableOpacity
          style={styles.demoLockBanner}
          onPress={() => setUnlockModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.demoLockLeft}>
            <Ionicons name="lock-closed" size={15} color="#FEF08A" />
            <Text style={styles.demoLockText}>
              CLIENT PREVIEW (BLOCKED DEMO) • Editing, Printing & Export Locked ({demoActionsRemaining} demo scans left)
            </Text>
          </View>
          <View style={styles.demoUnlockPill}>
            <Text style={styles.demoUnlockPillText}>Unlock</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ACTIVE SCREEN */}
      <View style={styles.screenBody}>
        {activeTab === 'scan' && <ScannerScreen />}
        {activeTab === 'products' && <ProductsScreen />}
        {activeTab === 'stock' && <StockScreen />}
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'settings' && <SettingsScreen />}

        {/* DIAGONAL WATERMARK WHEN LOCKED FOR CLIENT PREVIEW */}
        {isClientDemoLocked && (
          <View pointerEvents="none" style={styles.watermarkOverlay}>
            <Text style={styles.watermarkText}>CLIENT PREVIEW • LOCKED DEMO</Text>
          </View>
        )}
      </View>

      {/* BOTTOM NAVIGATION BAR */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('scan')}
        >
          <Ionicons
            name="scan-circle"
            size={24}
            color={activeTab === 'scan' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'scan' && styles.tabLabelActive,
            ]}
          >
            Scan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('products')}
        >
          <Ionicons
            name="phone-portrait-outline"
            size={21}
            color={activeTab === 'products' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'products' && styles.tabLabelActive,
            ]}
          >
            Phones & QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('stock')}
        >
          <View>
            <Ionicons
              name="cube-outline"
              size={21}
              color={activeTab === 'stock' ? '#007AFF' : '#8E8E93'}
            />
            {lowStockCount > 0 && (
              <View style={styles.badgeCircle}>
                <Text style={styles.badgeCircleText}>{lowStockCount}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'stock' && styles.tabLabelActive,
            ]}
          >
            Stock & Alerts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('dashboard')}
        >
          <Ionicons
            name={role === 'OWNER' && !isClientDemoLocked ? 'bar-chart-outline' : 'lock-closed-outline'}
            size={21}
            color={activeTab === 'dashboard' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'dashboard' && styles.tabLabelActive,
            ]}
          >
            Profit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('settings')}
        >
          <Ionicons
            name="settings-outline"
            size={21}
            color={activeTab === 'settings' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'settings' && styles.tabLabelActive,
            ]}
          >
            Updates & Lock
          </Text>
        </TouchableOpacity>
      </View>

      {/* CLIENT PREVIEW LICENSE UNLOCK MODAL */}
      <Modal
        visible={unlockModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnlockModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="lock-closed" size={22} color="#DC2626" />
              <Text style={styles.modalTitle}>Client Preview Mode (Locked)</Text>
            </View>
            <Text style={styles.modalDesc}>
              This app is currently running in Blocked Client Showcase Mode so you can preview how the Mobile Store QR Inventory system works. Adding/editing inventory, printing QR label sheets, and exporting reports are locked until activated by the developer.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter Developer Unlock Key or PIN"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              value={licenseInput}
              onChangeText={setLicenseInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setUnlockModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Continue Preview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleUnlockSubmit}
              >
                <Text style={styles.modalConfirmText}>Unlock Full App</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <InventoryProvider>
        <StatusBar style="dark" backgroundColor="#F2F2F7" />
        <MainShell />
      </InventoryProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  brandBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },
  headerEyebrow: {
    color: '#8E8E93',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  headerTitle: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 5,
  },
  syncPillOnline: {
    backgroundColor: 'rgba(52, 199, 89, 0.14)',
  },
  syncPillOffline: {
    backgroundColor: 'rgba(255, 149, 0, 0.14)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    color: '#1C1C1E',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  roleOwner: {
    backgroundColor: '#1C1C1E',
  },
  roleStaff: {
    backgroundColor: '#5856D6',
  },
  roleDemoLocked: {
    backgroundColor: '#FF3B30',
  },
  roleText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  demoLockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  demoLockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  demoLockText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  demoUnlockPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  demoUnlockPillText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '700',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  watermarkOverlay: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-24deg' }],
    opacity: 0.08,
  },
  watermarkText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FF3B30',
    letterSpacing: 2,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  badgeCircle: {
    position: 'absolute',
    right: -8,
    top: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeCircleText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.3,
  },
  modalDesc: {
    fontSize: 13,
    color: '#636366',
    lineHeight: 19,
    marginBottom: 16,
  },
  modalInput: {
    height: 44,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#000000',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
