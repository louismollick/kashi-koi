import { Pressable, FlatList, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getAlbum, getAlbumSongs, libraryStore } from '@/store/libraryStore';
import { getVisibleSongs } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { Cover } from '@/components/Cover';
import { ScreenHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { SongRow } from '@/components/SongRow';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Button, Label, styles } from '@/components/ui';

/** Album artwork, metadata, Play/Shuffle, and its ordered songs. */
export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  libraryStore(state => state.songs);
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const album = getAlbum(id);
  if (!album) return <View style={styles.page}><ScreenHeader title="Album" /><Label muted style={{ padding: 16 }}>Album not found</Label></View>;
  const allTracks = getAlbumSongs(album.id);
  const tracks = getVisibleSongs(allTracks, hiding);
  const startAlbum = (shuffle = false) => {
    appStore.getState().startAlbum(album.id, shuffle);
    router.push('/player');
  };
  return <View style={styles.page}>
    <ScreenHeader />
    <FlatList data={tracks} keyExtractor={song => song.id} contentContainerStyle={styles.content} renderItem={({ item, index }) => <SongRow song={item} number={index + 1} />} ListHeaderComponent={<View style={{ gap: 16 }}>
      <View style={{ alignItems: 'center' }}><Cover song={album} size={Math.min(236, width - 64)} /></View>
      <View style={{ gap: 4 }}>
        <Label style={styles.title}>{album.title}</Label>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open artist ${album.artist}`} hitSlop={6} onPress={() => router.push({ pathname: '/library/artist/[id]', params: { id: album.artistId } })}>
          <Label style={{ color: colors.lavender, fontSize: 16 }}>{album.artist}</Label>
        </Pressable>
        <Label muted style={{ fontSize: 13 }}>{album.year} · {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</Label>
      </View>
      <View style={styles.row}>
        <Button label="Play album" fill={colors.coral} border="#ff9aa5" style={{ flex: 1 }} disabled={!tracks.length} onPress={() => startAlbum()}>
          <View style={styles.row}><Icon name="play" size={22} /><Label style={{ fontWeight: '700' }}>Play</Label></View>
        </Button>
        <Button label="Shuffle album" border="#4b4f80" style={{ flex: 1 }} disabled={!tracks.length} onPress={() => startAlbum(true)}><Label style={{ fontWeight: '700' }}>Shuffle</Label></Button>
      </View>
    </View>} ListFooterComponent={
      <HiddenSongsRow count={allTracks.length - getVisibleSongs(allTracks, true).length} album />
    } />
  </View>;
}
