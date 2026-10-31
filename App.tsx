import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { InventoryProvider, useInventory } from './src/context/InventoryContext';
import ScannerScreen from './app/(tabs)/index';
import ProductsScreen from './app/(tabs)/products';
import StockScreen from './app/(tabs)/stock';
import DashboardScreen from './app/(tabs)/dashboard';
import SettingsScreen from './app/(tabs)/settings';
import { LoadingView, TabContext, TabKey } from './src/ui/nav';
import { Field, Section, Sheet, haptic } from './src/ui/components';
import { showAlert } from './src/ui/dialog';
import { space, type, usePalette } from './src/ui/theme';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'scan', label: 'Scan', icon: 'scan-outline', iconOn: 'scan' },
  { key: 'products', label: 'Products', icon: 'pricetags-outline', iconOn: 'pricetags' },
  { key: 'stock', label: 'Stock', icon: 'cube-outline', iconOn: 'cube' },
  { key: 'profit', label: 'Profit', icon: 'bar-chart-outline', iconOn: 'bar-chart' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', iconOn: 'settings' },
];

function MainShell() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('scan');
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const { isReady, role, lowStockProducts, isClientDemoLocked, demoActionsRemaining, unlockClientDemo } =
    useInventory();
  const tabCtx = useMemo(() => ({ tab, setTab }), [tab]);

  if (!isReady) return <LoadingView />;

  const handleUnlock = async () => {
    if (await unlockClientDemo(licenseInput)) {
      setLicenseInput('');
      setUnlockVisible(false);
      showAlert('Full version unlocked', 'All features are now available on this phone.');
    } else {
      showAlert('That key did not work', 'Check the key or contact the developer for a store licence.');
    }
  };

  return (
    <TabContext.Provider value={tabCtx}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

        {isClientDemoLocked ? (
          <Pressable
            onPress={() => setUnlockVisible(true)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: c.orangeSoft,
              paddingHorizontal: space.lg,
              paddingVertical: 8,
            }}
          >
            <Ionicons name="lock-closed" size={14} color={c.orange} />
            <Text style={[type.footnote, { color: c.label, flex: 1 }]} numberOfLines={1}>
              Preview mode · {demoActionsRemaining} demo scans left
            </Text>
            <Text style={[type.footnote, { color: c.tint, fontWeight: '600' }]}>Unlock</Text>
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }}>
          {tab === 'scan' && <ScannerScreen />}
          {tab === 'products' && <ProductsScreen />}
          {tab === 'stock' && <StockScreen />}
          {tab === 'profit' && <DashboardScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </View>

        {/* iOS tab bar */}
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            backgroundColor: c.barBackground,
            borderTopWidth: Platform.OS === 'web' ? 0.5 : 0.33,
            borderTopColor: c.separator,
            paddingBottom: Math.max(insets.bottom, 6),
            paddingTop: 6,
          }}
        >
          {TABS.map((t) => {
            const on = tab === t.key;
            const locked = t.key === 'profit' && (role !== 'OWNER' || isClientDemoLocked);
            const color = on ? c.tint : c.gray;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t.key === 'stock' && lowStockProducts.length ? `${t.label}, ${lowStockProducts.length} low` : t.label}
                onPress={() => {
                  if (!on) haptic('select');
                  setTab(t.key);
                }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 }}
              >
                <View>
                  <Ionicons name={locked ? 'lock-closed-outline' : on ? t.iconOn : t.icon} size={24} color={color} />
                  {t.key === 'stock' && lowStockProducts.length > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -10,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 9,
                        paddingHorizontal: 4,
                        backgroundColor: c.red,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{lowStockProducts.length}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 10, fontWeight: '500', color, marginTop: 2 }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Sheet
          visible={unlockVisible}
          title="Unlock full version"
          onClose={() => setUnlockVisible(false)}
          action={{ label: 'Unlock', onPress: handleUnlock, disabled: !licenseInput.trim() }}
        >
          <Section footer="This phone is in client preview mode. Editing, printing and exports are locked until it is unlocked with the developer key or the owner PIN.">
            <Field
              label="Licence key or owner PIN"
              value={licenseInput}
              onChangeText={setLicenseInput}
              autoCapitalize="characters"
              autoCorrect={false}
              secureTextEntry
              onSubmitEditing={handleUnlock}
            />
          </Section>
        </Sheet>
      </View>
    </TabContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <InventoryProvider>
        <MainShell />
      </InventoryProvider>
    </SafeAreaProvider>
  );
}
