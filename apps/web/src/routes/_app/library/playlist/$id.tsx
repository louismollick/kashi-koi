import { countedFilters, getVisibleSongs, useLibraryFilters } from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getPlaylistSongs, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { createFileRoute } from '@tanstack/react-router';
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

export const Route = createFileRoute('/_app/library/playlist/$id')({ component: PlaylistDetailScreen });

/** A Navidrome playlist: artwork, Play/Shuffle, and its visible songs in playlist order. */
function PlaylistDetailScreen() {
  const { id } = Route.useParams();
  const desktop = useIsDesktop();
  const songs = libraryStore((state) => state.songs);
  const playlist = libraryStore((state) => state.playlists.find((playlist) => playlist.id === id));
  const filters = useLibraryFilters();
  // Visibility reads each song's lyrics, which only change with `songs`; `queue` stays stable so the memoized rows don't re-render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: songs invalidates the playlist's tracks, which are read from the store
  const { tracks, queue, hiddenCount, minutes } = useMemo(() => {
    const allTracks = playlist ? getPlaylistSongs(playlist.id) : [],
      tracks = getVisibleSongs(allTracks, filters);
    return {
      tracks,
      queue: tracks.map((song) => song.id),
      hiddenCount: allTracks.length - getVisibleSongs(allTracks, countedFilters(filters)).length,
      minutes: Math.round(tracks.reduce((total, song) => total + song.duration, 0) / 60),
    };
  }, [playlist, songs, filters]);
  if (!playlist)
    return (
      <Screen header={<ScreenHeader title="Playlist" />}>
        <Label muted className="block p-4">
          Playlist not found
        </Label>
      </Screen>
    );
  return (
    <Screen header={<ScreenHeader />}>
      <div className="flex flex-col gap-4 p-4">
        <DetailHeader artwork={<Cover song={playlist} size={desktop ? 200 : 236} />}>
          <div className="flex flex-col gap-1">
            <Label className="block text-[22px] leading-7 font-bold">{playlist.name}</Label>
            <Label muted className="block text-[13px]">
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · {minutes} min
            </Label>
          </div>
          <PlayButtons
            noun="playlist"
            disabled={!tracks.length}
            start={(shuffle) => appStore.getState().startPlaylist(playlist.id, shuffle)}
          />
        </DetailHeader>
        <div>
          {/* Playlists can list a song twice, so rows are keyed by position and tell the queue where they are. */}
          <VirtualList
            items={tracks}
            rowHeight={songRowHeight}
            renderItem={(song, index) => <SongRow song={song} number={index + 1} queue={queue} queueIndex={index} />}
          />
          <HiddenSongsRow count={hiddenCount} album />
        </div>
      </div>
    </Screen>
  );
}
