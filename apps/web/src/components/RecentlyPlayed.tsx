import { getRecentlyPlayed, useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { useMemo, useRef } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useOpenPlayer } from '@/hooks/useOpenPlayer';
import { Cover } from './Cover';
import { FogBadge } from './Fog';
import { Label, SectionHeader } from './ui';
import { gridLayout } from './VirtualList';

/**
 * "Recently played" and `rows` full rows of covers, as many across as fit tiles of `minTile`px. Playing one queues
 * the recents as shown. Nothing renders until something has been played.
 */
export function RecentlyPlayed({ rows, minTile }: { rows: number; minTile: number }) {
  const songs = libraryStore((state) => state.songs);
  const filters = useLibraryFilters();
  const openPlayer = useOpenPlayer();
  const grid = useRef<HTMLDivElement>(null);
  const width = useElementWidth(grid);
  const { columns, size } = gridLayout(width, minTile, 12);
  const recent = useMemo(() => getRecentlyPlayed(filters, columns * rows, songs), [filters, columns, rows, songs]);
  return (
    <div className={recent.length ? 'flex flex-col gap-[14px]' : undefined}>
      {recent.length > 0 && <SectionHeader title="Recently played" />}
      <div
        ref={grid}
        className="grid justify-between gap-y-3"
        style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)` }}
      >
        {width > 0 &&
          recent.map((song) => (
            <button
              key={song.id}
              type="button"
              aria-label={`Play ${song.title}`}
              onClick={() =>
                openPlayer(() =>
                  appStore.getState().startSong(
                    song.id,
                    recent.map((song) => song.id),
                  ),
                )
              }
              className="block text-left transition-[filter] active:opacity-70 hover:brightness-110"
              style={{ width: size }}
            >
              <Cover song={song} size={size} />
              <Label lines={1} className="mt-1.5 text-[15px] font-bold">
                {song.title}
              </Label>
              <span className="flex items-center gap-1.5">
                <Label muted lines={1} className="flex-1 text-xs">
                  {song.artist}
                </Label>
                <FogBadge songId={song.id} compact />
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
