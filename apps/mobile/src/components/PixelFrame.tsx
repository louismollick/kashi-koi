import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** Mix an opaque hex color toward white (amount > 0) or black (amount < 0). */
export function tint(color: string, amount: number) {
  const value = Number.parseInt(color.slice(1, 7), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255];
  const target = amount > 0 ? 255 : 0;
  return `#${channels
    .map((channel) =>
      Math.round(channel + (target - channel) * Math.abs(amount))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Rectangle path whose corners step inward `steps` times by `size` points. */
function stepped(x0: number, y0: number, x1: number, y1: number, steps: number, size: number) {
  const cut = steps * size;
  let d = `M${x0 + cut} ${y0} H${x1 - cut}`;
  for (let i = 1; i <= steps; i++) d += ` V${y0 + i * size} H${x1 - (steps - i) * size}`;
  d += ` V${y1 - cut}`;
  for (let i = 1; i <= steps; i++) d += ` H${x1 - i * size} V${y1 - (steps - i) * size}`;
  d += ` H${x0 + cut}`;
  for (let i = 1; i <= steps; i++) d += ` V${y1 - i * size} H${x0 + (steps - i) * size}`;
  d += ` V${y0 + cut}`;
  for (let i = 1; i <= steps; i++) d += ` H${x0 + i * size} V${y0 + (steps - i) * size}`;
  return `${d} Z`;
}

/**
 * Shared pixel-cornered shape for every button, card, tag and cover.
 * Draws the fill behind the children and a 2pt outline on top of them. The outline
 * defaults to a lighter tint of the fill, like the banner; pass `border={null}` to hide it.
 */
export function PixelFrame({
  children,
  fill,
  border,
  style,
  contentStyle,
}: {
  children?: ReactNode;
  fill: string;
  border?: string | null;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const steps = Math.min(width, height) >= 36 ? 3 : 2;
  const stroke = border === undefined ? tint(fill, 0.22) : border;
  const ready = width > 0 && height > 0;
  return (
    <View
      style={style}
      onLayout={({ nativeEvent }) => {
        const { width: w, height: h } = nativeEvent.layout;
        if (w !== width || h !== height) setSize({ width: w, height: h });
      }}
    >
      {ready && (
        <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path d={stepped(0, 0, width, height, steps, 2)} fill={fill} />
        </Svg>
      )}
      <View style={contentStyle}>{children}</View>
      {ready && stroke && (
        <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path d={stepped(1, 1, width - 1, height - 1, steps, 2)} fill="none" stroke={stroke} strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}
