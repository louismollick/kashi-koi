import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getArtist, songs } from '@/data/fakeData';
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
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const artist = getArtist(id);
  if (!artist) return <View style={styles.page}><ScreenHeader title="Artist" /><Label muted style={{ padding: 16 }}>Artist not found</Label></View>;
  const artistAlbums = getVisibleLibrary(hiding).albums.filter(album => album.artistId === artist.id);
  const artistSongs = songs.filter(song => song.artistId === artist.id);
  const size = (width - 56) / 3;
  return <View style={styles.page}>
    <ScreenHeader />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Cover song={artistAlbums[0] ?? artist} size={184} />
        <Label style={styles.title}>{artist.name}</Label>
        <Label muted style={{ fontSize: 13 }}>{artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}</Label>
      </View>
      <SectionHeader title="Albums" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {artistAlbums.map(album => <AlbumTile key={album.id} album={album} size={size} />)}
      </View>
      <HiddenSongsRow count={artistSongs.length - getVisibleSongs(artistSongs, true).length} />
    </ScrollView>
  </View>;
}
