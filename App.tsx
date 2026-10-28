import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  const { role, lowStockProducts, cloudConfig, unsyncedCount } = useInventory();
  const lowStockCount = lowStockProducts.length;
  const isCloudConfigured = Boolean(cloudConfig.supabaseUrl && cloudConfig.supabaseAnonKey);

  const tabTitles: Record<ActiveTab, string> = {
    scan: 'QR & Barcode Scanner',
    products: 'Products & Designer QR',
    stock: 'Stock & Reorder List',
    dashboard: 'Revenue & Gross Profit',
    settings: 'Users, Roles & Cloud Sync',
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
              role === 'OWNER' ? styles.roleOwner : styles.roleStaff,
            ]}
          >
            <Ionicons
              name={role === 'OWNER' ? 'shield-checkmark' : 'person'}
              size={11}
              color="#FFFFFF"
            />
            <Text style={styles.roleText}>{role}</Text>
          </View>
        </View>
      </View>

      {/* ACTIVE SCREEN */}
      <View style={styles.screenBody}>
        {activeTab === 'scan' && <ScannerScreen />}
        {activeTab === 'products' && <ProductsScreen />}
        {activeTab === 'stock' && <StockScreen />}
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
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
            name="pricetags-outline"
            size={21}
            color={activeTab === 'products' ? '#0D9488' : '#64748B'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'products' && styles.tabLabelActive,
            ]}
          >
            Catalogue
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
            name={role === 'OWNER' ? 'bar-chart-outline' : 'lock-closed-outline'}
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
            Roles & Sync
          </Text>
        </TouchableOpacity>
      </View>
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
  roleText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
});
