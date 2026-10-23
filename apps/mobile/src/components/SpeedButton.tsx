import { Pressable } from 'react-native';
import { colors } from '@/constants/theme';
import { settingsStore } from '@/store/settingsStore';
import { Label } from './ui';

/** Player header control that cycles 1x, 0.75x and 0.5x. A slowed speed shows in lavender so it isn't forgotten. */
export function SpeedButton() {
  const rate = settingsStore((state) => state.playbackRate);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${rate}x`}
      hitSlop={8}
      onPress={() => settingsStore.getState().cyclePlaybackRate()}
      style={({ pressed }) => ({ minWidth: 44, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Label
        muted={rate === 1}
        style={[
          { fontSize: 13, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
          rate !== 1 && { color: colors.lavender },
        ]}
      >
        {rate}x
      </Label>
    </Pressable>
  );
}
