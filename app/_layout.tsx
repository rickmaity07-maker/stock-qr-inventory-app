import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InventoryProvider } from '../src/context/InventoryContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <InventoryProvider>
        <StatusBar style="light" backgroundColor="#0F172A" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </InventoryProvider>
    </SafeAreaProvider>
  );
}
