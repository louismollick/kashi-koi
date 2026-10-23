import { getAlbum } from '@kashi-koi/core/store/libraryStore';
import { appStore } from '@kashi-koi/core/store/appStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import type { Song } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { memo, type ReactNode } from 'react';
import { useOpenPlayer } from '@/hooks/useOpenPlayer';
import { Cover } from './Cover';
import { FogBadge } from './Fog';
import { Icon } from './Icon';
import { Label } from './ui';

/** Row height, so virtualized lists can place rows without measuring them. */
export const songRowHeight = 64;

/**
 * A song in the Library, an album's numbered list or Up next. Clicking plays it with `queue` (stable ids, default
 * just this song) as the queue, unless `onPress` overrides it. `accessory` sits after the duration, like Up next's
 * drag handle.
 */
export const SongRow = memo(function SongRow({
  song,
  number,
  queue,
  queueIndex,
  onPress,
  accessory,
}: {
  song: Song;
  number?: number;
  queue?: string[];
  /** This row's position in `queue`, for lists that repeat a song. */
  queueIndex?: number;
  onPress?: () => void;
  accessory?: ReactNode;
}) {
  const openPlayer = useOpenPlayer();
  const hideUnsynced = settingsStore((state) => state.hideSongsWithoutSyncedLyrics);
  const duration = `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration) % 60).padStart(2, '0')}`;
  return (
    <button
      type="button"
      aria-label={`Play ${song.title}${song.lyricsStatus === 'synced' ? '' : ', no lyrics'}`}
      onClick={onPress ?? (() => openPlayer(() => appStore.getState().startSong(song.id, queue, queueIndex)))}
      className="flex w-full items-center gap-[10px] border-b border-track py-2 text-left transition-[filter] active:opacity-70 hover:brightness-125"
      style={{ height: songRowHeight }}
    >
      {number === undefined ? (
        <Cover song={getAlbum(song.albumId) ?? song} size={46} />
      ) : (
        <Label muted className="w-[26px] shrink-0 text-center text-sm">
          {number}
        </Label>
      )}
      <span className="block min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Label lines={1} className="shrink text-base font-bold">
            {song.title}
          </Label>
          {!hideUnsynced && song.lyricsStatus !== 'synced' && (
            <Icon name="micOff" color={colors.muted} size={16} label="No synced lyrics" />
          )}
        </span>
        {number === undefined && (
          <Label muted lines={1} className="text-[13px]">
            {song.artist}
          </Label>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <Label muted className="text-[13px] tabular-nums">
          {duration}
        </Label>
        <FogBadge songId={song.id} compact />
      </span>
      {accessory}
    </button>
  );
});
