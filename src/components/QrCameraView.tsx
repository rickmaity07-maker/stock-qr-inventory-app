/**
 * Camera that reports QR codes and barcodes (Android / iOS native app).
 * The iPhone web app uses QrCameraView.web.tsx instead.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CameraMessage, QrCameraProps, Reticle } from './QrCameraShared';

export function QrCameraView({ enabled, scanning, onCode, accentColor, onResume }: QrCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return <CameraMessage icon="camera-outline" title="Checking camera access…" />;
  if (!permission.granted) {
    return (
      <CameraMessage
        icon="camera-outline"
        title="Camera access is off"
        message={
          permission.canAskAgain
            ? 'Allow the camera to scan QR stickers and barcodes.'
            : 'Turn on camera access for this app in your phone settings.'
        }
        action={permission.canAskAgain ? { label: 'Allow camera', onPress: requestPermission } : undefined}
      />
    );
  }
  if (!enabled) {
    return <CameraMessage icon="pause-circle-outline" title="Camera paused" action={{ label: 'Resume camera', onPress: onResume }} />;
  }
  return (
    <>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
        onBarcodeScanned={scanning ? ({ data }) => onCode(String(data ?? '')) : undefined}
      />
      <Reticle color={accentColor} />
    </>
  );
}
