import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { spriteFrames } from '../../assets/sprites/metadata';

const strips = {
  bobbing: require('../../assets/sprites/bobbing.png'),
  headbang: require('../../assets/sprites/headbang.png'),
};

/** Step the transparent sprite at 6fps idle or 10fps for a combo of three. */
export function Mascot({ combo = 0, size = 130 }: { combo?: number; size?: number }) {
  const mode = combo >= 3 ? 'headbang' : 'bobbing';
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFrame(0);
    const timer = setInterval(
      () => setFrame((value) => (value + 1) % spriteFrames.count),
      1000 / (mode === 'headbang' ? 10 : 6),
    );
    return () => clearInterval(timer);
  }, [mode]);
  return (
    <View accessibilityLabel={`Mascot ${mode}`} style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={failed ? require('../../assets/girl.png') : strips[mode]}
        onError={() => setFailed(true)}
        contentFit="fill"
        style={{
          width: failed ? size : size * spriteFrames.count,
          height: size,
          position: 'absolute',
          left: failed ? 0 : -frame * size,
        }}
      />
    </View>
  );
}
