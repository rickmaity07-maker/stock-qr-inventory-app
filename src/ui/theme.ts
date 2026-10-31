/**
 * Apple Human Interface Guidelines tokens: iOS system colours (light + dark),
 * the iOS Dynamic Type scale, and spacing. Every screen styles itself from these.
 */
import { useMemo } from 'react';
import { Platform, StyleSheet, TextStyle, useColorScheme } from 'react-native';

export interface Palette {
  scheme: 'light' | 'dark';
  background: string; // systemGroupedBackground
  surface: string; // secondarySystemGroupedBackground (cells, cards)
  surfaceRaised: string; // tertiarySystemGroupedBackground
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  placeholder: string;
  separator: string;
  fill: string; // tertiarySystemFill (inputs, segmented track)
  fillStrong: string; // secondarySystemFill
  tint: string; // systemBlue
  tintSoft: string;
  green: string;
  greenSoft: string;
  orange: string;
  orangeSoft: string;
  red: string;
  redSoft: string;
  indigo: string;
  indigoSoft: string;
  gray: string;
  barBackground: string; // translucent tab bar / nav bar
  onTint: string;
  overlay: string;
}

const light: Palette = {
  scheme: 'light',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceRaised: '#F2F2F7',
  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.6)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  placeholder: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.29)',
  fill: 'rgba(118,118,128,0.12)',
  fillStrong: 'rgba(120,120,128,0.16)',
  tint: '#007AFF',
  tintSoft: 'rgba(0,122,255,0.12)',
  green: '#34C759',
  greenSoft: 'rgba(52,199,89,0.14)',
  orange: '#FF9500',
  orangeSoft: 'rgba(255,149,0,0.14)',
  red: '#FF3B30',
  redSoft: 'rgba(255,59,48,0.12)',
  indigo: '#5856D6',
  indigoSoft: 'rgba(88,86,214,0.12)',
  gray: '#8E8E93',
  barBackground: 'rgba(249,249,249,0.94)',
  onTint: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
};

const dark: Palette = {
  scheme: 'dark',
  background: '#000000',
  surface: '#1C1C1E',
  surfaceRaised: '#2C2C2E',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235,235,245,0.6)',
  tertiaryLabel: 'rgba(235,235,245,0.3)',
  placeholder: 'rgba(235,235,245,0.3)',
  separator: 'rgba(84,84,88,0.65)',
  fill: 'rgba(118,118,128,0.24)',
  fillStrong: 'rgba(120,120,128,0.32)',
  tint: '#0A84FF',
  tintSoft: 'rgba(10,132,255,0.2)',
  green: '#30D158',
  greenSoft: 'rgba(48,209,88,0.2)',
  orange: '#FF9F0A',
  orangeSoft: 'rgba(255,159,10,0.2)',
  red: '#FF453A',
  redSoft: 'rgba(255,69,58,0.2)',
  indigo: '#5E5CE6',
  indigoSoft: 'rgba(94,92,230,0.22)',
  gray: '#8E8E93',
  barBackground: 'rgba(22,22,24,0.94)',
  onTint: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.6)',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Memoised StyleSheet that rebuilds when the colour scheme changes. */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Palette) => T): T {
  const c = usePalette();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(factory(c)), [c]);
}

/** San Francisco on iPhone (native and Safari), Roboto on Android. */
const fontFamily = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  default: undefined,
});

const t = (size: number, weight: TextStyle['fontWeight'], lineHeight: number, letterSpacing = 0): TextStyle => ({
  fontSize: size,
  fontWeight: weight,
  lineHeight,
  letterSpacing,
  ...(fontFamily ? { fontFamily } : null),
});

/** iOS Dynamic Type "Large" sizes. */
export const type = {
  largeTitle: t(34, '700', 41, 0.37),
  title1: t(28, '700', 34, 0.36),
  title2: t(22, '700', 28, 0.35),
  title3: t(20, '600', 25, 0.38),
  headline: t(17, '600', 22, -0.41),
  body: t(17, '400', 22, -0.41),
  callout: t(16, '400', 21, -0.32),
  subhead: t(15, '400', 20, -0.24),
  footnote: t(13, '400', 18, -0.08),
  caption1: t(12, '400', 16, 0),
  caption2: t(11, '400', 13, 0.07),
};

/** Tabular figures so prices and stock counts line up in columns. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 };
export const radius = { sm: 8, md: 10, lg: 12, xl: 16, sheet: 14 };

export function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
