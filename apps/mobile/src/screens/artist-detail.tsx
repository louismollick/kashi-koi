import { useMemo } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getArtist, libraryStore } from '@/store/libraryStore';
import { countBy, countedFilters, getVisibleLibrary, getVisibleSongs, syncedIds } from '@/data/libraryVisibility';
import { appStore, useLibraryFilters } from '@/store/appStore';
import { AlbumTile } from '@/components/AlbumTile';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Cover } from '@/components/Cover';
import { DownloadButton } from '@/components/DownloadButton';
import { PlayButtons } from '@/components/PlayButtons';
import { ScreenHeader } from '@/components/Header';
import { Label, SectionHeader, styles } from '@/components/ui';

/** Artist artwork, Play/Shuffle for every visible song, and a grid of that artist's albums. */
export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const songs = libraryStore((state) => state.songs),
    albums = libraryStore((state) => state.albums),
    lyrics = libraryStore((state) => state.lyrics);
  const filters = useLibraryFilters();
  const artist = getArtist(id);
  // Visibility reads each song's lyrics, so recompute only when the library, lyrics or filters change.
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
  }, [artist, songs, albums, lyrics, filters]);
  if (!artist)
    return (
      <View style={styles.page}>
        <ScreenHeader title="Artist" />
        <Label muted style={{ padding: 16 }}>
          Artist not found
        </Label>
      </View>
    );
  const size = (width - 56) / 3;
  return (
    <View style={styles.page}>
      <ScreenHeader right={<DownloadButton target={{ kind: 'artist', id: artist.id }} />} />
      <FlatList
        data={artistAlbums}
        numColumns={3}
        columnWrapperStyle={{ gap: 12 }}
        keyExtractor={(album) => album.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <AlbumTile
            album={item}
            size={size}
            count={albumCounts.get(item.id) ?? 0}
            noLyrics={!filters.hideUnsynced && !synced.albums.has(item.id)}
          />
        )}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 16 }}>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <Cover song={artistAlbums[0] ?? artist} size={184} />
              <Label style={styles.title}>{artist.name}</Label>
              <Label muted style={{ fontSize: 13 }}>
                {artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}
              </Label>
            </View>
            <PlayButtons
              noun="artist"
              disabled={!visible.songs.length}
              start={(shuffle) => appStore.getState().startArtist(artist.id, shuffle)}
            />
            <SectionHeader title="Albums" />
          </View>
        }
        ListFooterComponent={<HiddenSongsRow count={hiddenCount} />}
      />
    </View>
  );
}
