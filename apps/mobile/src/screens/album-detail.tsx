import { useMemo } from 'react';
import { Pressable, FlatList, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { getAlbum, getAlbumSongs, libraryStore } from '@/store/libraryStore';
import { countedFilters, getVisibleSongs } from '@/data/libraryVisibility';
import { appStore, useLibraryFilters } from '@/store/appStore';
import { Cover } from '@/components/Cover';
import { DownloadButton } from '@/components/DownloadButton';
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
  const songs = libraryStore((state) => state.songs),
    lyrics = libraryStore((state) => state.lyrics);
  const filters = useLibraryFilters();
  const album = getAlbum(id);
  // Visibility reads each song's lyrics; `queue` stays stable so the memoized rows don't re-render.
  const { tracks, queue, hiddenCount } = useMemo(() => {
    const allTracks = album ? getAlbumSongs(album.id) : [],
      tracks = getVisibleSongs(allTracks, filters);
    return {
      tracks,
      queue: tracks.map((song) => song.id),
      hiddenCount: allTracks.length - getVisibleSongs(allTracks, countedFilters(filters)).length,
    };
  }, [album, songs, lyrics, filters]);
  if (!album)
    return (
      <View style={styles.page}>
        <ScreenHeader title="Album" />
        <Label muted style={{ padding: 16 }}>
          Album not found
        </Label>
      </View>
    );
  const startAlbum = (shuffle = false) => {
    router.push('/player');
    appStore.getState().startAlbum(album.id, shuffle);
  };
  return (
    <View style={styles.page}>
      <ScreenHeader right={<DownloadButton target={{ kind: 'album', id: album.id }} />} />
      <FlatList
        data={tracks}
        keyExtractor={(song) => song.id}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => <SongRow song={item} number={index + 1} queue={queue} />}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={{ alignItems: 'center' }}>
              <Cover song={album} size={Math.min(236, width - 64)} />
            </View>
            <View style={{ gap: 4 }}>
              <Label style={styles.title}>{album.title}</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open artist ${album.artist}`}
                hitSlop={6}
                onPress={() => router.push({ pathname: '/library/artist/[id]', params: { id: album.artistId } })}
              >
                <Label style={{ color: colors.lavender, fontSize: 16 }}>{album.artist}</Label>
              </Pressable>
              <Label muted style={{ fontSize: 13 }}>
                {album.year} · {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
              </Label>
            </View>
            <View style={styles.row}>
              <Button
                label="Play album"
                fill={colors.coral}
                border={colors.coralBorder}
                style={{ flex: 1 }}
                disabled={!tracks.length}
                onPress={() => startAlbum()}
              >
                <View style={styles.row}>
                  <Icon name="play" size={22} />
                  <Label style={{ fontWeight: '700' }}>Play</Label>
                </View>
              </Button>
              <Button
                label="Shuffle album"
                border="#4b4f80"
                style={{ flex: 1 }}
                disabled={!tracks.length}
                onPress={() => startAlbum(true)}
              >
                <Label style={{ fontWeight: '700' }}>Shuffle</Label>
              </Button>
            </View>
          </View>
        }
        ListFooterComponent={<HiddenSongsRow count={hiddenCount} album />}
      />
    </View>
  );
}
