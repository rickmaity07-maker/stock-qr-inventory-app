import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useInventory } from '../../src/context/InventoryContext';

export default function TabsLayout() {
  const { role, lowStockProducts, cloudConfig, unsyncedCount } = useInventory();
  const lowStockCount = lowStockProducts.length;
  const isCloudConfigured = Boolean(cloudConfig.supabaseUrl && cloudConfig.supabaseAnonKey);

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0F172A',
          elevation: 4,
        },
        headerTitleStyle: {
          color: '#FFFFFF',
          fontWeight: '700',
          fontSize: 17,
        },
        headerRight: () => (
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
                    ? `Syncing (${unsyncedCount})`
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
                size={12}
                color="#FFFFFF"
              />
              <Text style={styles.roleText}>{role}</Text>
            </View>
          </View>
        ),
        tabBarActiveTintColor: '#0F766E',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Scan',
          headerTitle: 'QR & Barcode Scanner',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan-circle" size={size + 4} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Catalogue',
          headerTitle: 'Products & QR Labels',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pricetags-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock & Alerts',
          headerTitle: 'Stock & Reorder List',
          tabBarBadge: lowStockCount > 0 ? lowStockCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Profit',
          headerTitle: 'Revenue & Gross Profit',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={role === 'OWNER' ? 'bar-chart-outline' : 'lock-closed-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Roles & Sync',
          headerTitle: 'Users, Roles & Cloud Sync',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    gap: 8,
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
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: '#0F766E',
  },
  roleStaff: {
    backgroundColor: '#3B82F6',
  },
  roleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
