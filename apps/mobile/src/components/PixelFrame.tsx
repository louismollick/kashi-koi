import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { stepped, tint } from '@kashi-koi/design/shape';

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
