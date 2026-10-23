import { type FogTile, lyricsFog } from '@kashi-koi/core/lyrics/fog';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getLyrics, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { useMemo } from 'react';
import { Icon } from './Icon';
import { Label } from './ui';

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
    <span className="flex h-[10px] gap-0.5">
      {tiles.map((tile, index) => (
        // Tiles have no identity beyond their position in the song.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional list
        <span key={index} className="flex-1" style={{ background: tileColor[tile] }} />
      ))}
    </span>
  );
}

/** Gold koi for a perfect run; otherwise a hollow outline, so its absence reads as something to earn. */
export function Koi({ perfect, size = 18 }: { perfect: boolean; size?: number }) {
  return (
    <Icon
      name={perfect ? 'koi' : 'fish'}
      size={size}
      color={perfect ? colors.combo : colors.muted}
      label={perfect ? 'Perfect run' : 'No perfect run yet'}
    />
  );
}

/**
 * A song's fog percentage and koi. Rows pass `compact`: nothing until the song has been quizzed, and the koi only
 * once earned. The song menu and player always show both.
 */
export function FogBadge({ songId, compact = false }: { songId: string; compact?: boolean }) {
  const { tiles, percent } = useSongFog(songId),
    perfect = appStore((state) => !!state.perfectRuns[songId]);
  if (!tiles.length || (compact && !perfect && tiles.every((tile) => tile === 'fog'))) return null;
  return (
    <span className="flex items-center gap-1">
      <Label
        className="text-[13px] font-bold tabular-nums"
        style={{ color: percent === 100 ? colors.cream : colors.muted }}
      >
        {percent}%
      </Label>
      {(!compact || perfect) && <Koi perfect={perfect} size={compact ? 14 : 22} />}
    </span>
  );
}
