import {
  countBy,
  countedFilters,
  getVisibleLibrary,
  getVisibleSongs,
  syncedIds,
  useLibraryFilters,
} from '@kashi-koi/core/data/libraryVisibility';
import { appStore } from '@kashi-koi/core/store/appStore';
import { getArtist, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { AlbumTile, albumTileHeight } from '@/components/AlbumTile';
import { Cover } from '@/components/Cover';
import { ScreenHeader } from '@/components/Header';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { PlayButtons } from '@/components/PlayButtons';
import { Screen } from '@/components/Screen';
import { Label, SectionHeader } from '@/components/ui';
import { VirtualGrid } from '@/components/VirtualList';
import { useIsDesktop } from '@/hooks/useIsDesktop';

export const Route = createFileRoute('/_app/library/artist/$id')({ component: ArtistDetailScreen });

/** Artist artwork, Play/Shuffle for every visible song, and a grid of that artist's albums. */
function ArtistDetailScreen() {
  const { id } = Route.useParams();
  const desktop = useIsDesktop();
  const songs = libraryStore((state) => state.songs),
    albums = libraryStore((state) => state.albums);
  const filters = useLibraryFilters();
  const artist = getArtist(id);
  // Visibility reads each song's lyrics, which only change with `songs`, so recompute only when the library or filters change.
  const { artistAlbums, albumCounts, synced, hiddenCount } = useMemo(() => {
    if (!artist)
      return { artistAlbums: [], albumCounts: new Map<string, number>(), synced: syncedIds([]), hiddenCount: 0 };
    const artistSongs = songs.filter((song) => song.artistId === artist.id);
    const ownAlbums = albums.filter((album) => album.artistId === artist.id),
      albumIds = new Set(ownAlbums.map((album) => album.id));
    // Album songs can credit a different artist, so visibility follows the album, not the song's artist.
    const visible = getVisibleLibrary(filters, {
      songs: songs.filter((song) => albumIds.has(song.albumId)),
      albums: ownAlbums,
      artists: [artist],
    });
    return {
      artistAlbums: visible.albums.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
      albumCounts: countBy(visible.songs, (song) => song.albumId),
      synced: syncedIds(songs),
      hiddenCount: artistSongs.length - getVisibleSongs(artistSongs, countedFilters(filters)).length,
    };
  }, [artist, songs, albums, filters]);
  if (!artist)
    return (
      <Screen header={<ScreenHeader title="Artist" />}>
        <Label muted className="block p-4">
          Artist not found
        </Label>
      </Screen>
    );
  return (
    <Screen header={<ScreenHeader />}>
      <div className="flex flex-col gap-4 p-4">
        <div className={desktop ? 'flex items-end gap-6' : 'flex flex-col items-center gap-3'}>
          <Cover song={artistAlbums[0] ?? artist} size={desktop ? 160 : 184} />
          <div className={desktop ? 'flex min-w-0 flex-1 flex-col gap-1' : 'flex flex-col items-center gap-3'}>
            <Label className="block text-[22px] leading-7 font-bold">{artist.name}</Label>
            <Label muted className="block text-[13px]">
              {artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}
            </Label>
          </div>
        </div>
        <PlayButtons
          noun="artist"
          disabled={!artistAlbums.length}
          start={(shuffle) => appStore.getState().startArtist(artist.id, shuffle)}
        />
        <SectionHeader title="Albums" />
        <div>
          <VirtualGrid
            items={artistAlbums}
            minTile={desktop ? 140 : 100}
            tileHeight={albumTileHeight}
            getKey={(album) => album.id}
            renderItem={(album, size) => (
              <AlbumTile
                album={album}
                size={size}
                count={albumCounts.get(album.id) ?? 0}
                noLyrics={!filters.hideUnsynced && !synced.albums.has(album.id)}
              />
            )}
          />
          <HiddenSongsRow count={hiddenCount} />
        </div>
      </div>
    </Screen>
  );
}
