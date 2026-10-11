import { FlatList, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getArtist, libraryStore } from '@/store/libraryStore';
import { countBy, countedFilters, getVisibleLibrary, getVisibleSongs, syncedIds } from '@/data/libraryVisibility';
import { useLibraryFilters } from '@/store/appStore';
import { AlbumTile } from '@/components/AlbumTile';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Cover } from '@/components/Cover';
import { ScreenHeader } from '@/components/Header';
import { Label, SectionHeader, styles } from '@/components/ui';

/** Artist artwork and a grid of that artist's albums. */
export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  libraryStore((state) => state.songs);
  libraryStore((state) => state.lyrics);
  const filters = useLibraryFilters();
  const artist = getArtist(id);
  if (!artist)
    return (
      <View style={styles.page}>
        <ScreenHeader title="Artist" />
        <Label muted style={{ padding: 16 }}>
          Artist not found
        </Label>
      </View>
    );
  const artistSongs = libraryStore.getState().songs.filter((song) => song.artistId === artist.id);
  const albums = libraryStore.getState().albums.filter((album) => album.artistId === artist.id),
    albumIds = new Set(albums.map((album) => album.id));
  // Album songs can credit a different artist, so visibility follows the album, not the song's artist.
  const visible = getVisibleLibrary(filters, {
    songs: libraryStore.getState().songs.filter((song) => albumIds.has(song.albumId)),
    albums,
    artists: [artist],
  });
  const artistAlbums = visible.albums.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const albumCounts = countBy(visible.songs, (song) => song.albumId),
    synced = syncedIds(libraryStore.getState().songs);
  const size = (width - 56) / 3;
  return (
    <View style={styles.page}>
      <ScreenHeader />
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
            <SectionHeader title="Albums" />
          </View>
        }
        ListFooterComponent={
          <HiddenSongsRow count={artistSongs.length - getVisibleSongs(artistSongs, countedFilters(filters)).length} />
        }
      />
    </View>
  );
}
