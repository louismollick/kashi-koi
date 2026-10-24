import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { spriteFrames } from '@kashi-koi/design/sprites/metadata';
import { colors, font } from '@/constants/theme';

const strips = {
  bobbing: require('@kashi-koi/design/sprites/bobbing.png'),
  headbang: require('@kashi-koi/design/sprites/headbang.png'),
};

/** Still poses, registered on the sprite frame so swapping one in doesn't move her chair. */
const poses = {
  doze: require('../../assets/doze.png'),
  catch: require('../../assets/catch.png'),
  miss: require('../../assets/miss.png'),
};
const poseLabels: Record<keyof typeof poses, string> = {
  doze: 'dozing',
  catch: 'holding a koi',
  miss: 'looking at an empty hook',
};

/** The transparent strip under her chair legs, as a fraction of her size: frames end the legs at 420 of 464px. */
export const spriteFoot = 0.09;

/**
 * `play` bobs (or headbangs on a combo of three); `doze` naps while nothing plays; `catch` holds up a koi; `miss` looks
 * at the bare hook after a wrong answer. Her face stays deadpan in all of them.
 */
export type Pose = 'play' | keyof typeof poses;

/**
 * Step the transparent sprite at 6fps idle or 10fps for a combo of three. Frames advance on the UI thread,
 * so quiz scoring and playback ticks on the JS thread can't make her stutter. A still `pose` replaces the strip.
 */
export function Mascot({ combo = 0, size = 130, pose = 'play' }: { combo?: number; size?: number; pose?: Pose }) {
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
  if (pose !== 'play')
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`Mascot ${poseLabels[pose]}`}>
        <Image source={poses[pose]} contentFit="fill" style={{ width: size, height: size }} />
        {pose === 'doze' && <Snore size={size} />}
      </View>
    );
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

/** A third z that drifts up from the drawn pair and fades, on a slow loop. Hidden for reduced motion; the drawn pair stays. */
function Snore({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const fontSize = Math.max(12, size * 0.075);
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    clock.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
    return () => cancelAnimation(clock);
  }, [reduced, clock]);
  // Stepped jumps like the sprite: it fades in over the first quarter, then drifts and fades out.
  const style = useAnimatedStyle(() => {
    const step = Math.floor(clock.value * 12) / 12;
    return {
      opacity: step < 0.25 ? step / 0.25 : 1 - (step - 0.25) / 0.75,
      transform: [{ translateX: step * fontSize * 0.9 }, { translateY: -step * fontSize * 1.8 }],
    };
  });
  if (reduced) return null;
  return (
    <Animated.Text
      accessible={false}
      pointerEvents="none"
      style={[
        font('pixel'),
        {
          position: 'absolute',
          left: size * 0.62,
          top: size * 0.16,
          color: colors.cream,
          fontSize,
          lineHeight: fontSize,
        },
        style,
      ]}
    >
      z
    </Animated.Text>
  );
}
