import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { steps } from 'react-native-reanimated';
import { spriteFrames } from '../../assets/sprites/metadata';

const strips = {
  bobbing: require('../../assets/sprites/bobbing.png'),
  headbang: require('../../assets/sprites/headbang.png'),
};

// Slide the whole strip one full width to the left in `count` hard steps; percentages are of the strip's own width.
const slide = {
  from: { transform: [{ translateX: '0%' }] },
  to: { transform: [{ translateX: '-100%' }] },
} as const;
const frameRate = { bobbing: 6, headbang: 10 };

/**
 * Step the transparent sprite at 6fps idle or 10fps for a combo of three. The stepped slide runs on the UI thread,
 * so it costs no JS work; changing mode remounts the strip, which restarts it at frame 0.
 */
export function Mascot({ combo = 0, size = 130 }: { combo?: number; size?: number }) {
  const mode = combo >= 3 ? 'headbang' : 'bobbing';
  const [failed, setFailed] = useState(false);
  return (
    <View accessibilityLabel={`Mascot ${mode}`} style={{ width: size, height: size, overflow: 'hidden' }}>
      {failed ? (
        <Image source={require('../../assets/girl.png')} contentFit="fill" style={{ width: size, height: size }} />
      ) : (
        <Animated.View
          key={mode}
          style={{
            width: size * spriteFrames.count,
            height: size,
            animationName: slide,
            animationDuration: `${spriteFrames.count / frameRate[mode]}s`,
            animationTimingFunction: steps(spriteFrames.count),
            animationIterationCount: 'infinite',
          }}
        >
          <Image
            source={strips[mode]}
            onError={() => setFailed(true)}
            contentFit="fill"
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      )}
    </View>
  );
}
