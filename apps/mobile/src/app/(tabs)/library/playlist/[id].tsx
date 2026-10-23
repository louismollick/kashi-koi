import { useMemo } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getPlaylistSongs, libraryStore } from '@/store/libraryStore';
import { countedFilters, getVisibleSongs, useLibraryFilters } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { Cover } from '@/components/Cover';
import { ScreenHeader } from '@/components/Header';
import { PlayButtons } from '@/components/PlayButtons';
import { SongRow } from '@/components/SongRow';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Label, styles } from '@/components/ui';

/** A Navidrome playlist: artwork, Play/Shuffle, and its visible songs in playlist order. */
export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const songs = libraryStore((state) => state.songs);
  const playlist = libraryStore((state) => state.playlists.find((playlist) => playlist.id === id));
  const filters = useLibraryFilters();
  // Visibility reads each song's lyrics, which only change with `songs`; `queue` stays stable so the memoized rows don't re-render.
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
      <View style={styles.page}>
        <ScreenHeader title="Playlist" />
        <Label muted style={{ padding: 16 }}>
          Playlist not found
        </Label>
      </View>
    );
  return (
    <View style={styles.page}>
      <ScreenHeader />
      <FlatList
        data={tracks}
        // Playlists can list a song twice.
        keyExtractor={(song, index) => `${index}:${song.id}`}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => <SongRow song={item} number={index + 1} queue={queue} queueIndex={index} />}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={{ alignItems: 'center' }}>
              <Cover song={playlist} size={Math.min(236, width - 64)} />
            </View>
            <View style={{ gap: 4 }}>
              <Label style={styles.title}>{playlist.name}</Label>
              <Label muted style={{ fontSize: 13 }}>
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · {minutes} min
              </Label>
            </View>
            <PlayButtons
              noun="playlist"
              disabled={!tracks.length}
              start={(shuffle) => appStore.getState().startPlaylist(playlist.id, shuffle)}
            />
          </View>
        }
        ListFooterComponent={<HiddenSongsRow count={hiddenCount} album />}
      />
    </View>
  );
}
