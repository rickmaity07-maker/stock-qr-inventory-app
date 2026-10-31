/**
 * iOS-style building blocks: inset grouped lists, segmented control, buttons,
 * sheets, form fields and empty states. All colours come from the theme.
 */
import React, { Children, Fragment, isValidElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette, radius, space, tabular, type, usePalette, useStyles } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'tint' | 'green' | 'orange' | 'red' | 'indigo' | 'gray';

export function toneColors(c: Palette, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'green':
      return { fg: c.green, bg: c.greenSoft };
    case 'orange':
      return { fg: c.orange, bg: c.orangeSoft };
    case 'red':
      return { fg: c.red, bg: c.redSoft };
    case 'indigo':
      return { fg: c.indigo, bg: c.indigoSoft };
    case 'gray':
      return { fg: c.secondaryLabel, bg: c.fill };
    default:
      return { fg: c.tint, bg: c.tintSoft };
  }
}

export function haptic(kind: 'select' | 'success' | 'warning' | 'error' = 'select') {
  if (Platform.OS === 'web') return;
  const p =
    kind === 'select'
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(
          kind === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : kind === 'warning'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Error
        );
  p.catch(() => {});
}

/** Pressable with the iOS "dim on touch" feedback. */
export function Tap({ style, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [style, pressed && !rest.disabled ? { opacity: 0.55 } : null]}
    >
      {children as ReactNode}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen scaffolding
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.background }, contentStyle]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={[{ paddingBottom: space.xxl }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  );
}

export function LargeTitle({
  title,
  subtitle,
  accessory,
}: {
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
}) {
  const s = useStyles((c) => ({
    wrap: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
    title: { ...type.largeTitle, color: c.label },
    subtitle: { ...type.subhead, color: c.secondaryLabel, marginTop: 2 },
  }));
  return (
    <View style={s.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={s.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {accessory}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inset grouped list
// ---------------------------------------------------------------------------

export function Section({
  header,
  footer,
  children,
  style,
  headerAccessory,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  headerAccessory?: ReactNode;
}) {
  const s = useStyles((c) => ({
    wrap: { marginTop: space.xl, marginHorizontal: space.lg },
    headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: 7 },
    header: { ...type.footnote, color: c.secondaryLabel, textTransform: 'uppercase', flex: 1 },
    card: { backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' },
    sep: { height: Platform.OS === 'web' ? 0.5 : 0.33, backgroundColor: c.separator, marginLeft: space.lg },
    footer: { ...type.footnote, color: c.secondaryLabel, paddingHorizontal: space.lg, marginTop: 7 },
  }));
  const items = flattenChildren(children);
  return (
    <View style={[s.wrap, style]}>
      {header || headerAccessory ? (
        <View style={s.headerRow}>
          <Text style={s.header}>{header}</Text>
          {headerAccessory}
        </View>
      ) : null}
      <View style={s.card}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={s.sep} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

function flattenChildren(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || child === false) return;
    if (isValidElement(child) && child.type === Fragment) {
      out.push(...flattenChildren((child.props as { children?: ReactNode }).children));
    } else {
      out.push(child);
    }
  });
  return out;
}

export function IconTile({ name, color, size = 29 }: { name: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size * 0.6} color="#FFFFFF" />
    </View>
  );
}

export function Row({
  title,
  subtitle,
  value,
  left,
  right,
  onPress,
  chevron,
  destructive,
  tinted,
  disabled,
  numberOfLines = 1,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  tinted?: boolean;
  disabled?: boolean;
  numberOfLines?: number;
  accessibilityLabel?: string;
}) {
  const s = useStyles((c) => ({
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.lg, paddingVertical: 11, gap: space.md, backgroundColor: c.surface },
    title: { ...type.body, color: c.label },
    subtitle: { ...type.footnote, color: c.secondaryLabel, marginTop: 1 },
    value: { ...type.body, ...tabular, color: c.secondaryLabel },
  }));
  const c = usePalette();
  const titleColor = destructive ? c.red : tinted ? c.tint : c.label;
  const body = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: disabled ? c.tertiaryLabel : titleColor }]} numberOfLines={numberOfLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={s.value}>{value}</Text> : null}
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={17} color={c.tertiaryLabel} /> : null}
    </>
  );
  if (!onPress) return <View style={s.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fillStrong }]}
    >
      {body}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles((c) => ({
    track: { flexDirection: 'row', backgroundColor: c.fill, borderRadius: 9, padding: 2 },
    seg: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
    segOn: {
      backgroundColor: c.scheme === 'dark' ? '#636366' : '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    label: { ...type.footnote, fontWeight: '500', color: c.label },
    labelOn: { fontWeight: '600' },
  }));
  return (
    <View style={[s.track, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) {
                haptic('select');
                onChange(o.value);
              }
            }}
            style={[s.seg, on && s.segOn]}
          >
            <Text style={[s.label, on && s.labelOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';

export function Button({
  title,
  onPress,
  variant = 'filled',
  icon,
  disabled,
  loading,
  color,
  size = 'large',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  size?: 'large' | 'medium' | 'small';
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const accent = color || (variant === 'destructive' ? c.red : c.tint);
  const bg =
    variant === 'filled'
      ? accent
      : variant === 'tinted' || variant === 'destructive'
      ? color
        ? `${accent}22`
        : variant === 'destructive'
        ? c.redSoft
        : c.tintSoft
      : variant === 'gray'
      ? c.fill
      : 'transparent';
  const fg = variant === 'filled' ? c.onTint : accent;
  const height = size === 'large' ? 50 : size === 'medium' ? 40 : 32;
  const font = size === 'small' ? type.subhead : type.headline;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={({ pressed }) => [
        {
          height,
          borderRadius: size === 'small' ? 16 : radius.lg,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingHorizontal: size === 'small' ? 12 : 16,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'small' ? 15 : 19} color={fg} /> : null}
          <Text style={[font, { color: fg }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Badge({ text, tone = 'tint', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const c = usePalette();
  const { fg, bg } = toneColors(c, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text style={[type.caption1, tabular, { color: fg, fontWeight: '600' }]}>{text}</Text>
    </View>
  );
}

export function Notice({
  tone = 'tint',
  icon,
  title,
  message,
  action,
  onClose,
  style,
}: {
  tone?: Tone;
  icon?: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const { fg, bg } = toneColors(c, tone);
  return (
    <View
      accessibilityRole="alert"
      style={[
        { flexDirection: 'row', gap: space.md, backgroundColor: bg, borderRadius: radius.lg, padding: space.md, marginHorizontal: space.lg, marginTop: space.md },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.subhead, { color: c.label, fontWeight: '600' }]}>{title}</Text>
        {message ? <Text style={[type.footnote, { color: c.secondaryLabel, marginTop: 2 }]}>{message}</Text> : null}
        {action ? (
          <Tap onPress={action.onPress} style={{ marginTop: 6, alignSelf: 'flex-start' }} accessibilityRole="button">
            <Text style={[type.subhead, { color: fg, fontWeight: '600' }]}>{action.label}</Text>
          </Tap>
        ) : null}
      </View>
      {onClose ? (
        <Tap onPress={onClose} accessibilityLabel="Dismiss" hitSlop={10}>
          <Ionicons name="close" size={18} color={c.secondaryLabel} />
        </Tap>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const c = usePalette();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: 48, gap: space.sm }}>
      <Ionicons name={icon} size={46} color={c.tertiaryLabel} />
      <Text style={[type.title3, { color: c.label, textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[type.subhead, { color: c.secondaryLabel, textAlign: 'center' }]}>{message}</Text> : null}
      {action ? <Button title={action.label} onPress={action.onPress} variant="tinted" size="medium" style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function Field({
  label,
  error,
  hint,
  suffix,
  ...input
}: TextInputProps & { label: string; error?: string | null; hint?: string; suffix?: string }) {
  const c = usePalette();
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: 10, backgroundColor: c.surface }}>
      <Text style={[type.footnote, { color: error ? c.red : c.secondaryLabel }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          placeholderTextColor={c.placeholder}
          {...input}
          style={[type.body, { color: c.label, flex: 1, minWidth: 0, paddingVertical: 4, minHeight: 30 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
          accessibilityLabel={label}
        />
        {suffix ? <Text style={[type.body, { color: c.secondaryLabel }]}>{suffix}</Text> : null}
      </View>
      {error ? (
        <Text style={[type.footnote, { color: c.red }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.footnote, { color: c.tertiaryLabel }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  const c = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.fill,
        borderRadius: radius.md,
        height: 36,
        paddingHorizontal: 8,
        gap: 6,
        marginHorizontal: space.lg,
      }}
    >
      <Ionicons name="search" size={17} color={c.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.secondaryLabel}
        style={[type.body, { flex: 1, minWidth: 0, color: c.label, paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Tap onPress={() => onChangeText('')} accessibilityLabel="Clear search" hitSlop={8}>
          <Ionicons name="close-circle" size={17} color={c.secondaryLabel} />
        </Tap>
      ) : null}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max,
  bigStep,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  bigStep?: number;
}) {
  const c = usePalette();
  const n = parseInt(value, 10);
  const cur = Number.isFinite(n) ? n : min;
  const clamp = (v: number) => Math.max(min, max !== undefined ? Math.min(max, v) : v);
  const btn = (label: string, icon: IconName | null, delta: number, a11y: string) => (
    <Tap
      onPress={() => {
        haptic('select');
        onChange(String(clamp(cur + delta)));
      }}
      accessibilityLabel={a11y}
      accessibilityRole="button"
      style={{ width: 52, height: 44, borderRadius: radius.md, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}
    >
      {icon ? <Ionicons name={icon} size={22} color={c.tint} /> : <Text style={[type.headline, { color: c.tint }]}>{label}</Text>}
    </Tap>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {btn('', 'remove', -1, 'Decrease')}
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        accessibilityLabel="Quantity"
        style={[type.title2, tabular, { flex: 1, minWidth: 0, textAlign: 'center', color: c.label, height: 44, backgroundColor: c.fill, borderRadius: radius.md }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
      />
      {btn('', 'add', 1, 'Increase')}
      {bigStep ? btn(`+${bigStep}`, null, bigStep, `Increase by ${bigStep}`) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheet (iOS page sheet with a navigation bar)
// ---------------------------------------------------------------------------

export function Sheet({
  visible,
  title,
  onClose,
  closeLabel = 'Cancel',
  action,
  children,
  tall,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  action?: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };
  children: ReactNode;
  tall?: boolean;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            maxHeight: tall ? '94%' : '88%',
            minHeight: tall ? '70%' : undefined,
            paddingBottom: Math.max(insets.bottom, space.lg),
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}
          accessibilityViewIsModal
        >
          <View style={{ alignItems: 'center', paddingTop: 6 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: c.tertiaryLabel }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: space.lg }}>
            <Tap onPress={onClose} hitSlop={10} accessibilityRole="button" style={{ minWidth: 70 }}>
              <Text style={[type.body, { color: c.tint }]}>{closeLabel}</Text>
            </Tap>
            <Text style={[type.headline, { color: c.label, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={{ minWidth: 70, alignItems: 'flex-end' }}>
              {action ? (
                action.loading ? (
                  <ActivityIndicator color={c.tint} />
                ) : (
                  <Tap onPress={action.onPress} disabled={action.disabled} hitSlop={10} accessibilityRole="button">
                    <Text style={[type.headline, { color: action.disabled ? c.tertiaryLabel : c.tint }]}>{action.label}</Text>
                  </Tap>
                )
              ) : null}
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg }} style={{ width: '100%' }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A label + big number tile used on the dashboard and stock screens. */
export function StatTile({ label, value, tone, footnote }: { label: string; value: string; tone?: Tone; footnote?: string }) {
  const c = usePalette();
  const color = tone ? toneColors(c, tone).fg : c.label;
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, minHeight: 84 }}>
      <Text style={[type.footnote, { color: c.secondaryLabel }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.title2, tabular, { color, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {footnote ? <Text style={[type.caption1, { color: c.secondaryLabel, marginTop: 2 }]}>{footnote}</Text> : null}
    </View>
  );
}
