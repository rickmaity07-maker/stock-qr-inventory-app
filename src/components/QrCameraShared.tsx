import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/components';
import { space, type } from '../ui/theme';

export interface QrCameraProps {
  /** Camera switched on by the user */
  enabled: boolean;
  /** Report codes (false while a sheet is open) */
  scanning: boolean;
  onCode: (code: string) => void;
  accentColor: string;
  onResume: () => void;
}

export function Reticle({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={{ width: 190, height: 190, borderWidth: 3, borderRadius: 24, opacity: 0.9, borderColor: color }} />
    </View>
  );
}

export function CameraMessage({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ alignItems: 'center', gap: space.sm, padding: space.xl }}>
      <Ionicons name={icon} size={40} color="#FFFFFF" />
      <Text style={[type.headline, { color: '#FFFFFF', textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[type.footnote, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>{message}</Text>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} size="medium" style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}
