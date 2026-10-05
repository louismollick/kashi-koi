import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { PixelFrame } from './PixelFrame';
import { Icon } from './Icon';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/** System typography, shared across English and Japanese copy. */
export function Label({ children, muted = false, style, numberOfLines }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[styles.text, muted && { color: colors.muted }, style]}>{children}</Text>;
}

/** Filled pixel button with a 44-point minimum tap target. Pressing dims it slightly. */
export function Button({ children, onPress, fill = colors.slate, border, style, contentStyle, disabled = false, label }: {
  children: ReactNode; onPress: () => void; fill?: string; border?: string | null; style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>; disabled?: boolean; label?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
    <PixelFrame fill={fill} border={border} contentStyle={[styles.button, contentStyle]}>{children}</PixelFrame>
  </Pressable>;
}

/**
 * Square icon control. Framed by default (transport, back, close); `plain` drops the
 * frame for icons that sit directly on a card, like the mini player's pause.
 */
export function IconButton({ name, onPress, label, fill = colors.panel, border, color = colors.text, size = 44, iconScale = 0.55, plain = false, selected }: {
  name: ComponentProps<typeof Icon>['name']; onPress: () => void; label: string; fill?: string; border?: string | null;
  color?: string; size?: number; iconScale?: number; plain?: boolean; selected?: boolean;
}) {
  const icon = <Icon name={name} color={color} size={size * iconScale} />;
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' } as const;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
    {plain ? <View style={box}>{icon}</View> : <PixelFrame fill={fill} border={border ?? '#4b4d6a'} contentStyle={box}>{icon}</PixelFrame>}
  </Pressable>;
}

/** Pill switch used for QuizToggle and results review choices. */
export function PixelToggle({ on, onPress, label, disabled = false }: { disabled?: boolean; on: boolean; onPress: () => void; label: string }) {
  return <Pressable disabled={disabled} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress} hitSlop={10}>
    <PixelFrame fill={on ? colors.green : colors.track} border={null} contentStyle={{ width: 52, height: 30, padding: 4, alignItems: on ? 'flex-end' : 'flex-start' }}>
      <PixelFrame fill="#ffffff" border={null} contentStyle={{ width: 22, height: 22 }} />
    </PixelFrame>
  </Pressable>;
}

/** Compact NEW or rank label with the shared contour. */
export function Tag({ children, fill = colors.coral }: { children: ReactNode; fill?: string }) {
  return <PixelFrame fill={fill} border={null} contentStyle={{ paddingHorizontal: 7, paddingVertical: 2 }}><Label style={{ fontSize: 11, lineHeight: 15, fontWeight: '800' }}>{children}</Label></PixelFrame>;
}

/** Section title with an optional muted hint line and trailing chevron, as on the banner. */
export function SectionHeader({ title, hint, chevron = false, count }: { title: string; hint?: string; chevron?: boolean; count?: number }) {
  return <View style={styles.row}>
    <View style={{ flex: 1 }}>
      <Label style={{ fontSize: 20, lineHeight: 26, fontWeight: '700' }}>{title}{count !== undefined && <Label muted style={{ fontSize: 16, fontWeight: '500' }}>  {count}</Label>}</Label>
      {hint && <Label muted style={{ fontSize: 13 }}>{hint}</Label>}
    </View>
    {chevron && <Icon name="next" size={20} color={colors.muted} />}
  </View>;
}

export const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
});
