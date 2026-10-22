import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';

const BLOCKS = 3;

function Block({
  index,
  clock,
  color,
  size,
}: {
  index: number;
  clock: SharedValue<number>;
  color: string;
  size: number;
}) {
  const style = useAnimatedStyle(() => ({ opacity: Math.floor(clock.value) % BLOCKS === index ? 1 : 0.25 }));
  return <Animated.View style={[{ width: size, height: size, backgroundColor: color }, style]} />;
}

/** Three square blocks lit in turn on the UI thread: the pixel stand-in for ActivityIndicator. */
export function PixelSpinner({
  color = colors.lavender,
  size = 6,
  accessibilityLabel,
}: {
  color?: string;
  size?: number;
  accessibilityLabel?: string;
}) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = withRepeat(withTiming(BLOCKS, { duration: 750, easing: Easing.linear }), -1);
    return () => cancelAnimation(clock);
  }, [clock]);
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', gap: size / 2, alignItems: 'center' }}
    >
      {Array.from({ length: BLOCKS }, (_, index) => (
        <Block key={index} index={index} clock={clock} color={color} size={size} />
      ))}
    </View>
  );
}
