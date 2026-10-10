import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { styles } from './ui';
import type { StyleProp, TextStyle } from 'react-native';

/** One line of text, scrolling overflowing titles at 30 points per second. */
export function Marquee({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const [width, setWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const offset = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const textStyle = StyleSheet.flatten([styles.text, style]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    const overflow = textWidth - width;
    if (width > 0 && overflow > 1 && !reducedMotion) {
      offset.value = withRepeat(
        withSequence(
          withDelay(2000, withTiming(-overflow, { duration: (overflow / 30) * 1000, easing: Easing.linear })),
          withDelay(2000, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    }
    return () => cancelAnimation(offset);
  }, [children, width, textWidth, reducedMotion, offset]);

  return (
    <View
      style={{ height: textStyle.lineHeight ?? 21, overflow: 'hidden' }}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
    >
      {/* Horizontal content is unconstrained so the text reports its full width. */}
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        pointerEvents="none"
        style={{ flexGrow: 0 }}
      >
        <Animated.View style={animatedStyle}>
          <Text
            numberOfLines={1}
            style={textStyle}
            onLayout={({ nativeEvent }) => setTextWidth(nativeEvent.layout.width)}
          >
            {children}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
