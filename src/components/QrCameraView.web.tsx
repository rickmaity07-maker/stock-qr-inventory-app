/**
 * Lightweight QR scanner for the iPhone web app (Safari).
 *
 * Replaces expo-camera's web scanner, which created a new full-size canvas three times a
 * second and read every pixel on the UI thread. iOS Safari runs out of canvas memory with
 * that and the whole app freezes. Here: one reused canvas, frames shrunk to ≤480 px,
 * 4 decodes per second, nothing at all while a sheet is open or the app is hidden,
 * and the decoder (jsQR) is bundled, so scanning also works offline.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import jsQR from 'jsqr';
import { CameraMessage, QrCameraProps, Reticle } from './QrCameraShared';

const SCAN_EVERY_MS = 250;
const MAX_SIDE = 480;

type Status = 'starting' | 'live' | 'denied' | 'unavailable' | 'error';

export function QrCameraView({ enabled, scanning, onCode, accentColor, onResume }: QrCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [status, setStatus] = useState<Status>('starting');
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start / stop the camera stream
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    const media = (globalThis as any).navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    let cancelled = false;
    setStatus('starting');
    media
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then(async (stream: MediaStream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStatus('live');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setStatus(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'error');
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, attempt, stop]);

  // Decode a few frames per second while scanning
  useEffect(() => {
    if (status !== 'live' || !scanning || !enabled) return;
    const doc = (globalThis as any).document as Document;
    if (!canvasRef.current) canvasRef.current = doc.createElement('canvas');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
    if (!ctx) return;

    const tick = () => {
      const video = videoRef.current;
      if (doc.hidden || !video || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      const result = jsQR(frame.data, w, h, { inversionAttempts: 'dontInvert' });
      if (result?.data) onCodeRef.current(result.data);
    };
    const id = setInterval(tick, SCAN_EVERY_MS);
    return () => clearInterval(id);
  }, [status, scanning, enabled]);

  // Release the camera when the app goes to the background
  useEffect(() => {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const onVisibility = () => {
      if (doc.hidden) {
        stop();
        setStatus('starting');
      } else if (enabled) {
        setAttempt((n) => n + 1);
      }
    };
    doc.addEventListener('visibilitychange', onVisibility);
    return () => doc.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, stop]);

  if (!enabled) {
    return <CameraMessage icon="pause-circle-outline" title="Camera paused" action={{ label: 'Resume camera', onPress: onResume }} />;
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {React.createElement('video', {
        ref: videoRef,
        playsInline: true,
        muted: true,
        autoPlay: true,
        'aria-label': 'Camera',
        style: { width: '100%', height: '100%', objectFit: 'cover', display: status === 'live' ? 'block' : 'none' },
      })}
      {status === 'live' ? <Reticle color={accentColor} /> : null}
      {status !== 'live' ? (
        <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
          {status === 'starting' ? (
            <CameraMessage icon="camera-outline" title="Starting camera…" />
          ) : status === 'denied' ? (
            <CameraMessage
              icon="camera-outline"
              title="Camera access is off"
              message="Allow camera access for this site (Settings → Safari → Camera), then try again."
              action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }}
            />
          ) : (
            <CameraMessage
              icon="camera-outline"
              title="Camera not available"
              message="Pick products from the list below instead."
              action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
