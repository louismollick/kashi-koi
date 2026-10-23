import { getRecentlyPlayed, useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useRef } from 'react';
import background from '@assets/background.png';
import { Cover } from '@/components/Cover';
import { FogBadge } from '@/components/Fog';
import { TabHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Mascot } from '@/components/Mascot';
import { PixelFrame } from '@/components/PixelFrame';
import { Screen } from '@/components/Screen';
import { useDueCount } from '@/components/TabBar';
import { Label, SectionHeader } from '@/components/ui';
import { gridLayout } from '@/components/VirtualList';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useOpenPlayer } from '@/hooks/useOpenPlayer';

export const Route = createFileRoute('/_app/')({ component: HomeScreen });

/** Harbor hero scrolls away; its review card overlaps the dock's bottom edge. */
function HomeScreen() {
  const songs = libraryStore((state) => state.songs);
  const filters = useLibraryFilters();
  const count = useDueCount();
  const openPlayer = useOpenPlayer();
  const grid = useRef<HTMLDivElement>(null);
  const width = useElementWidth(grid);
  const desktop = useIsDesktop();
  // Three covers across on a phone, as many as fit on the desktop; always two rows of recents.
  const { columns, size } = gridLayout(width, desktop ? 140 : 100, 12);
  const recent = useMemo(() => getRecentlyPlayed(filters, columns * 2, songs), [filters, columns, songs]);
  return (
    <Screen header={<TabHeader />}>
      <div className="relative h-[250px]">
        <img src={background} alt="" fetchPriority="high" className="h-full w-full object-cover" />
        <div className="absolute bottom-2 left-[26px]">
          <Mascot size={240} />
        </div>
      </div>
      <div className="relative -mt-[26px] flex flex-col gap-[14px] px-4 pb-5">
        <Link
          to="/review"
          aria-label="Open review list"
          className="block transition-[filter] active:opacity-70 hover:brightness-110"
        >
          {count === 0 ? (
            <PixelFrame fill={colors.surface} border="#363a5e" contentClassName="flex items-center gap-[10px] p-[14px]">
              <Icon name="check" color={colors.green} size={22} />
              <Label className="font-semibold">All caught up</Label>
            </PixelFrame>
          ) : (
            <PixelFrame
              fill={colors.coralDeep}
              border="#ff8f9b"
              contentClassName="flex min-h-[122px] items-center gap-[10px] px-[18px] py-[14px]"
            >
              <Icon name="musicFilled" size={54} color={colors.cream} />
              <span className="flex flex-1 flex-col items-center">
                <Label pixel className="text-[22px] leading-[26px] font-bold tracking-[1px]">
                  REVIEW
                </Label>
                <Label pixel className="text-[34px] leading-[38px] font-bold">
                  {count}
                </Label>
                <Label pixel className="text-[22px] leading-[26px] font-bold tracking-[1px]">
                  LYRICS
                </Label>
              </span>
              <PixelFrame
                fill={colors.coralSoft}
                border={null}
                contentClassName="flex h-[52px] w-[52px] items-center justify-center"
              >
                <Icon name="next" size={40} />
              </PixelFrame>
            </PixelFrame>
          )}
        </Link>
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
    </Screen>
  );
}
