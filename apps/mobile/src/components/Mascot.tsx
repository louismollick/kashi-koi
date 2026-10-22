import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { spriteFrames } from '../../assets/sprites/metadata';

const strips = {
  bobbing: require('../../assets/sprites/bobbing.png'),
  headbang: require('../../assets/sprites/headbang.png'),
};

/**
 * Step the transparent sprite at 6fps idle or 10fps for a combo of three. Frames advance on the UI thread,
 * so quiz scoring and playback ticks on the JS thread can't make her stutter.
 */
export function Mascot({ combo = 0, size = 130 }: { combo?: number; size?: number }) {
  const mode = combo >= 3 ? 'headbang' : 'bobbing';
  const [failed, setFailed] = useState(false);
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(spriteFrames.count, {
        duration: (spriteFrames.count * 1000) / (mode === 'headbang' ? 10 : 6),
        easing: Easing.linear,
      }),
      -1,
    );
    return () => cancelAnimation(clock);
  }, [mode, clock]);
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -Math.min(spriteFrames.count - 1, Math.floor(clock.value)) * size }],
  }));
  return (
    <View accessibilityLabel={`Mascot ${mode}`} style={{ width: size, height: size, overflow: 'hidden' }}>
      {failed ? (
        <Image source={require('../../assets/girl.png')} contentFit="fill" style={{ width: size, height: size }} />
      ) : (
        <Animated.View style={[{ width: size * spriteFrames.count, height: size }, stripStyle]}>
          {/* Both strips stay mounted so the first combo of three doesn't flash while the headbang loads. */}
          {(['bobbing', 'headbang'] as const).map((strip) => (
            <Image
              key={strip}
              source={strips[strip]}
              onError={() => setFailed(true)}
              contentFit="fill"
              style={{
                position: 'absolute',
                width: size * spriteFrames.count,
                height: size,
                opacity: strip === mode ? 1 : 0,
              }}
            />
          ))}
        </Animated.View>
      )}
    </View>
  );
}
