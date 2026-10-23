import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '@/constants/theme';
import { PixelFrame } from './PixelFrame';
import { Icon } from './Icon';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/**
 * All app text. Rounded body type by default; `pixel` switches to the pixel face for titles, numbers and short labels.
 * `fontWeight` in `style` picks the face (see `font`).
 */
export function Label({
  children,
  muted = false,
  pixel = false,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  pixel?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const flat: TextStyle = StyleSheet.flatten([styles.text, muted && { color: colors.muted }, style]);
  return (
    <Text numberOfLines={numberOfLines} style={[flat, font(pixel ? 'pixel' : 'body', flat.fontWeight)]}>
      {children}
    </Text>
  );
}

/** Filled pixel button with a 44-point minimum tap target. Pressing dims it slightly. */
export function Button({
  children,
  onPress,
  fill = colors.slate,
  border,
  style,
  contentStyle,
  disabled = false,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  fill?: string;
  border?: string | null;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}
    >
      <PixelFrame fill={fill} border={border} contentStyle={[styles.button, contentStyle]}>
        {children}
      </PixelFrame>
    </Pressable>
  );
}

/**
 * Square icon control. Framed by default (transport, back, close); `plain` drops the
 * frame for icons that sit directly on a card, like the mini player's pause.
 */
export function IconButton({
  name,
  onPress,
  label,
  fill = colors.panel,
  border,
  color = colors.text,
  size = 44,
  iconScale = 0.55,
  plain = false,
  disabled = false,
}: {
  name: ComponentProps<typeof Icon>['name'];
  onPress: () => void;
  label: string;
  fill?: string;
  border?: string | null;
  color?: string;
  size?: number;
  iconScale?: number;
  plain?: boolean;
  disabled?: boolean;
}) {
  const icon = <Icon name={name} color={color} size={size * iconScale} />;
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}
    >
      {plain ? (
        <View style={box}>{icon}</View>
      ) : (
        <PixelFrame fill={fill} border={border ?? '#4b4d6a'} contentStyle={box}>
          {icon}
        </PixelFrame>
      )}
    </Pressable>
  );
}

/** Pill switch used for QuizToggle and results review choices. */
export function PixelToggle({
  on,
  onPress,
  label,
  disabled = false,
}: {
  disabled?: boolean;
  on: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      hitSlop={10}
    >
      <PixelFrame
        fill={on ? colors.green : colors.track}
        border={null}
        contentStyle={{ width: 52, height: 30, padding: 4, alignItems: on ? 'flex-end' : 'flex-start' }}
      >
        <PixelFrame fill="#ffffff" border={null} contentStyle={{ width: 22, height: 22 }} />
      </PixelFrame>
    </Pressable>
  );
}

/** Compact NEW or rank label with the shared contour. */
export function Tag({ children, fill = colors.coral }: { children: ReactNode; fill?: string }) {
  return (
    <PixelFrame fill={fill} border={null} contentStyle={{ paddingHorizontal: 7, paddingVertical: 2 }}>
      <Label pixel style={{ fontSize: 11, lineHeight: 15, fontWeight: '800' }}>
        {children}
      </Label>
    </PixelFrame>
  );
}

/**
 * One full-width menu row: label left, detail or control right, divided by a hairline. Used by the song menu and
 * Settings. Without `onPress` it's a plain row, so VoiceOver reaches the control inside it.
 */
export function Row({
  label,
  detail,
  onPress,
  disabled = false,
  color = colors.text,
  children,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
  children?: ReactNode;
}) {
  const row = [styles.row, { minHeight: 52, borderTopWidth: 1, borderTopColor: colors.track }],
    content = (
      <>
        <Label style={{ flex: 1, fontSize: 16, color }}>{label}</Label>
        {detail && (
          <Label muted numberOfLines={1} style={{ fontSize: 14, maxWidth: '55%' }}>
            {detail}
          </Label>
        )}
        {children}
      </>
    );
  if (!onPress) return <View style={[row, { opacity: disabled ? 0.45 : 1 }]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // The detail (last sync, progress, results) is read after the label.
      accessibilityValue={detail ? { text: detail } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [row, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

/** Pixel segmented control for a short list of choices, like Settings' answer time. */
export function Segmented<T>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4 }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.label}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
          >
            <PixelFrame
              fill={on ? colors.coral : colors.panel}
              border={on ? '#ff9aa5' : colors.track}
              contentStyle={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Label pixel style={{ fontSize: 15, fontWeight: '700', color: on ? colors.text : colors.muted }}>
                {option.label}
              </Label>
            </PixelFrame>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Section title on Home
, Settings and artist pages. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <Label pixel style={{ fontSize: 21, lineHeight: 26, fontWeight: '700' }}>
      {title}
    </Label>
  );
}

export const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
});
