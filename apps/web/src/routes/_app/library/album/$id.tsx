import { countedFilters, getVisibleSongs, useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getAlbum, getAlbumSongs, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Cover } from '@/components/Cover';
import { DetailHeader } from '@/components/DetailHeader';
import { ScreenHeader } from '@/components/Header';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { PlayButtons } from '@/components/PlayButtons';
import { Screen } from '@/components/Screen';
import { SongRow, songRowHeight } from '@/components/SongRow';
import { Label } from '@/components/ui';
import { VirtualList } from '@/components/VirtualList';
import { useIsDesktop } from '@/hooks/useIsDesktop';

export const Route = createFileRoute('/_app/library/album/$id')({ component: AlbumDetailScreen });

/** Album artwork, metadata, Play/Shuffle, and its ordered songs. */
function AlbumDetailScreen() {
  const { id } = Route.useParams();
  const desktop = useIsDesktop();
  const songs = libraryStore((state) => state.songs);
  const filters = useLibraryFilters();
  const album = getAlbum(id);
  // Visibility reads each song's lyrics, which only change with `songs`; `queue` stays stable so the memoized rows don't re-render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: songs invalidates the album's tracks, which are read from the store
  const { tracks, queue, hiddenCount } = useMemo(() => {
    const allTracks = album ? getAlbumSongs(album.id) : [],
      tracks = getVisibleSongs(allTracks, filters);
    return {
      tracks,
      queue: tracks.map((song) => song.id),
      hiddenCount: allTracks.length - getVisibleSongs(allTracks, countedFilters(filters)).length,
    };
  }, [album, songs, filters]);
  if (!album)
    return (
      <Screen header={<ScreenHeader title="Album" />}>
        <Label muted className="block p-4">
          Album not found
        </Label>
      </Screen>
    );
  return (
    <Screen header={<ScreenHeader />}>
      <div className="flex flex-col gap-4 p-4">
        <DetailHeader artwork={<Cover song={album} size={desktop ? 200 : 236} />}>
          <div className="flex flex-col gap-1">
            <Label className="block text-[22px] leading-7 font-bold">{album.title}</Label>
            <Link
              to="/library/artist/$id"
              params={{ id: album.artistId }}
              aria-label={`Open artist ${album.artist}`}
              className="block self-start hover:brightness-125"
            >
              <Label className="text-base" style={{ color: colors.lavender }}>
                {album.artist}
              </Label>
            </Link>
            <Label muted className="block text-[13px]">
              {album.year} · {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            </Label>
          </div>
          <PlayButtons
            noun="album"
            disabled={!tracks.length}
            start={(shuffle) => appStore.getState().startAlbum(album.id, shuffle)}
          />
        </DetailHeader>
        <div>
          <VirtualList
            items={tracks}
            rowHeight={songRowHeight}
            renderItem={(song, index) => <SongRow song={song} number={index + 1} queue={queue} />}
          />
          <HiddenSongsRow count={hiddenCount} album />
        </div>
      </div>
    </Screen>
  );
}
