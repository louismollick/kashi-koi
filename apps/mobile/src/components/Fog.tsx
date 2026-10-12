import { useMemo } from 'react';
import { View } from 'react-native';
import { colors } from '@/constants/theme';
import { lyricsFog, type FogTile } from '@/lyrics/fog';
import { appStore } from '@/store/appStore';
import { getLyrics, libraryStore } from '@/store/libraryStore';
import { Icon } from './Icon';
import { Label, styles } from './ui';

const tileColor: Record<FogTile, string> = { fog: colors.slate, half: '#6c6496', clear: colors.cream, red: colors.red };

/** A song's fog tiles and percent, recomputed only when its lyrics or the saved fog change. */
export function useSongFog(songId: string) {
  const fog = appStore((state) => state.fog),
    lyrics = libraryStore((state) => state.lyrics[songId]);
  return useMemo(() => lyricsFog(lyrics ?? getLyrics(songId), fog), [songId, lyrics, fog]);
}

/** One tile per sentence, in song order: fog, thinned, cleared or slipped (red). */
export function FogStrip({ tiles }: { tiles: FogTile[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, height: 10 }}>
      {tiles.map((tile, index) => (
        <View key={index} style={{ flex: 1, backgroundColor: tileColor[tile] }} />
      ))}
    </View>
  );
}

/** Gold koi for a perfect run; otherwise a hollow outline, so its absence reads as something to earn. */
export function Koi({ perfect, size = 18 }: { perfect: boolean; size?: number }) {
  return (
    <Icon
      name={perfect ? 'koi' : 'fish'}
      size={size}
      color={perfect ? colors.combo : colors.muted}
      accessibilityLabel={perfect ? 'Perfect run' : 'No perfect run yet'}
    />
  );
}

/**
 * A song's fog percentage and koi. Rows pass `compact`: nothing until the song has been quizzed,
 * and the koi only once earned. The song menu and full player always show both.
 */
export function FogBadge({ songId, compact = false }: { songId: string; compact?: boolean }) {
  const { tiles, percent } = useSongFog(songId),
    perfect = appStore((state) => !!state.perfectRuns[songId]);
  if (!tiles.length || (compact && !perfect && tiles.every((tile) => tile === 'fog'))) return null;
  return (
    <View style={[styles.row, { gap: 4 }]}>
      <Label
        style={{
          fontSize: 13,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
          color: percent === 100 ? colors.cream : colors.muted,
        }}
      >
        {percent}%
      </Label>
      {(!compact || perfect) && <Koi perfect={perfect} size={compact ? 14 : 22} />}
    </View>
  );
}
