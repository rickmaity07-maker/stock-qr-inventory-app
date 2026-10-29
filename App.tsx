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
      {/* TOP HEADER BAR */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>QR</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tabTitles[activeTab]}
          </Text>
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
                { backgroundColor: isCloudConfigured ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.syncText}>
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
              {isClientDemoLocked ? 'DEMO LOCKED' : role}
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
            color={activeTab === 'scan' ? '#0D9488' : '#64748B'}
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
            color={activeTab === 'products' ? '#0D9488' : '#64748B'}
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
              color={activeTab === 'stock' ? '#0D9488' : '#64748B'}
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
            color={activeTab === 'dashboard' ? '#0D9488' : '#64748B'}
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
            color={activeTab === 'settings' ? '#0D9488' : '#64748B'}
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
        <StatusBar style="light" backgroundColor="#090E1A" />
        <MainShell />
      </InventoryProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090E1A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#090E1A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 11,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  syncPillOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
  },
  syncPillOffline: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '700',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  roleOwner: {
    backgroundColor: '#0D9488',
  },
  roleStaff: {
    backgroundColor: '#2563EB',
  },
  roleDemoLocked: {
    backgroundColor: '#DC2626',
  },
  roleText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  demoLockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#991B1B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DC2626',
    gap: 8,
  },
  demoLockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  demoLockText: {
    color: '#FEF08A',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  demoUnlockPill: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  demoUnlockPillText: {
    color: '#7F1D1D',
    fontSize: 11,
    fontWeight: '900',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  watermarkOverlay: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-24deg' }],
    opacity: 0.12,
  },
  watermarkText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 2,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    height: 62,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
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
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#0D9488',
  },
  badgeCircle: {
    position: 'absolute',
    right: -8,
    top: -4,
    backgroundColor: '#DC2626',
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
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 14, 26, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 14,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0D9488',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
