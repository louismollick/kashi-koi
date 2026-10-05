import { FlatList, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getArtist, libraryStore } from '@/store/libraryStore';
import { getVisibleLibrary, getVisibleSongs } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { AlbumTile } from '@/components/AlbumTile';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Cover } from '@/components/Cover';
import { ScreenHeader } from '@/components/Header';
import { Label, SectionHeader, styles } from '@/components/ui';

/** Artist artwork and a grid of that artist's albums. */
export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  libraryStore(state => state.songs);
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const artist = getArtist(id);
  if (!artist) return <View style={styles.page}><ScreenHeader title="Artist" /><Label muted style={{ padding: 16 }}>Artist not found</Label></View>;
  const artistAlbums = getVisibleLibrary(hiding).albums.filter(album => album.artistId === artist.id).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const artistSongs = libraryStore.getState().songs.filter(song => song.artistId === artist.id);
  const size = (width - 56) / 3;
  return <View style={styles.page}>
    <ScreenHeader />
    <FlatList data={artistAlbums} numColumns={3} columnWrapperStyle={{ gap: 12 }} keyExtractor={album => album.id} contentContainerStyle={styles.content} renderItem={({ item }) => <AlbumTile album={item} size={size} />} ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 16 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Cover song={artistAlbums[0] ?? artist} size={184} />
        <Label style={styles.title}>{artist.name}</Label>
        <Label muted style={{ fontSize: 13 }}>{artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}</Label>
      </View>
      <SectionHeader title="Albums" />
    </View>} ListFooterComponent={
      <HiddenSongsRow count={artistSongs.length - getVisibleSongs(artistSongs, true).length} />
    } />
  </View>;
}
