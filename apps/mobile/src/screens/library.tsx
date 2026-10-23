import { useMemo, useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { colors } from '@/constants/theme';
import { getPlaylistSongs, libraryStore } from '@/store/libraryStore';
import {
  countBy,
  countedFilters,
  getVisibleLibrary,
  getVisibleSongs,
  groupBy,
  syncedIds,
  useLibraryFilters,
} from '@/data/libraryVisibility';
import { Header } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { AlbumTile } from '@/components/AlbumTile';
import { ArtistTile } from '@/components/ArtistTile';
import { SongRow } from '@/components/SongRow';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Icon } from '@/components/Icon';
import { Cover } from '@/components/Cover';
import { Button, Label, styles } from '@/components/ui';
import type { Playlist } from '@/types/domain';

const segments = ['Albums', 'Artists', 'Songs', 'Playlists'] as const;

/** A playlist with its visible song count; opens the playlist page. */
function PlaylistRow({ playlist, count }: { playlist: Playlist; count: number }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open playlist ${playlist.name}`}
      onPress={() => router.push({ pathname: '/library/playlist/[id]', params: { id: playlist.id } })}
      style={({ pressed }) => [
        styles.row,
        { minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.track },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Cover song={playlist} size={48} />
      <View style={{ flex: 1 }}>
        <Label numberOfLines={1} style={{ fontSize: 16, fontWeight: '700' }}>
          {playlist.name}
        </Label>
        <Label muted style={{ fontSize: 13 }}>
          {count} {count === 1 ? 'song' : 'songs'}
        </Label>
      </View>
    </Pressable>
  );
}
/** Pin grid tiles to their column edge, so three fixed-size tiles keep 12pt gaps in equal columns. */
const column = (index: number) => ({
  alignItems: (['flex-start', 'center', 'flex-end'] as const)[index % 3],
  marginBottom: 16,
});
/** Recycled grids and rows for the entire in-memory library. */
export default function LibraryScreen() {
  const { width } = useWindowDimensions();
  const [segment, setSegment] = useState<(typeof segments)[number]>('Albums'),
    [query, setQuery] = useState('');
  const songs = libraryStore((state) => state.songs),
    albums = libraryStore((state) => state.albums),
    artists = libraryStore((state) => state.artists),
    playlists = libraryStore((state) => state.playlists);
  const progress = libraryStore((state) => state.progress),
    error = libraryStore((state) => state.error);
  const filters = useLibraryFilters(),
    size = (width - 56) / 3;
  const source = useMemo(() => {
    const needle = query.toLowerCase();
    const matching = songs.filter((song) =>
      `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(needle),
    );
    const albumIds = new Set(matching.map((song) => song.albumId)),
      artistIds = new Set(matching.map((song) => song.artistId));
    return {
      songs: matching,
      albums: albums.filter((album) => albumIds.has(album.id)),
      artists: artists.filter((artist) => artistIds.has(artist.id)),
    };
  }, [songs, albums, artists, query]);
  // Visibility reads each song's lyrics, which only change with `songs`, so these recompute when the library or filters change.
  const { albumCounts, synced } = useMemo(
    () => ({
      // Counts and badges describe the whole album or artist, not just the songs matching the search.
      albumCounts: countBy(getVisibleSongs(songs, filters), (song) => song.albumId),
      synced: syncedIds(songs),
    }),
    [filters, songs],
  );
  const { visible, hidden, artistAlbums } = useMemo(() => {
    const visible = getVisibleLibrary(filters, source);
    return {
      visible,
      hidden: getVisibleLibrary(countedFilters(filters), source),
      artistAlbums: groupBy(visible.albums, (album) => album.artistId),
    };
  }, [filters, source]);
  // Playlists match by name and show only when some song in them is visible, like albums.
  const { shownPlaylists, playlistCounts, hiddenPlaylists } = useMemo(() => {
    const needle = query.toLowerCase(),
      matching = playlists.filter((playlist) => playlist.name.toLowerCase().includes(needle)),
      counted = countedFilters(filters);
    const playlistCounts = new Map(
      matching.map((playlist) => [playlist.id, getVisibleSongs(getPlaylistSongs(playlist.id), filters).length]),
    );
    return {
      shownPlaylists: matching.filter((playlist) => playlistCounts.get(playlist.id)),
      playlistCounts,
      hiddenPlaylists: matching.filter((playlist) => !getVisibleSongs(getPlaylistSongs(playlist.id), counted).length)
        .length,
    };
  }, [playlists, songs, filters, query]);
  // Playing from the Songs list queues the list as shown.
  const queue = useMemo(() => visible.songs.map((song) => song.id), [visible.songs]);
  const kind =
    segment === 'Albums' ? 'albums' : segment === 'Artists' ? 'artists' : segment === 'Songs' ? 'songs' : null;
  const header = (
    <View style={{ gap: 16, paddingBottom: 16 }}>
      <PixelFrame fill={colors.surface} contentStyle={[styles.row, { paddingHorizontal: 12 }]}>
        <Icon name="search" size={20} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search library"
          placeholder="Search songs, albums, artists"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          style={{ flex: 1, color: colors.text, height: 50, fontSize: 16 }}
          clearButtonMode="while-editing"
        />
      </PixelFrame>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {segments.map((value) => (
          <Button
            key={value}
            label={value}
            fill={segment === value ? colors.coral : colors.slate}
            onPress={() => setSegment(value)}
            style={{ flex: 1 }}
            // Four segments leave little width; tighter padding keeps "Playlists" on one line.
            contentStyle={{ paddingHorizontal: 4 }}
          >
            <Label numberOfLines={1} style={{ fontWeight: '700' }}>
              {value}
            </Label>
          </Button>
        ))}
      </View>
      {kind ? (
        <HiddenSongsRow count={source[kind].length - hidden[kind].length} kind={kind} />
      ) : (
        <HiddenSongsRow count={hiddenPlaylists} kind="playlists" />
      )}
      {progress && (
        <Label muted>
          {progress.kind === 'sync' ? 'Syncing library' : 'Checking lyrics'}… {progress.completed.toLocaleString()} /{' '}
          {progress.total.toLocaleString()}
        </Label>
      )}
      {error && <Label style={{ color: colors.red }}>{error}</Label>}
    </View>
  );
  const empty = (
    <Label muted>
      {progress
        ? 'Your library will appear as lyrics are checked'
        : query
          ? 'No matches'
          : segment === 'Playlists'
            ? 'No playlists'
            : 'No visible songs'}
    </Label>
  );
  return (
    <View style={styles.page}>
      <Header />
      {segment === 'Songs' ? (
        <FlashList
          key="songs"
          data={visible.songs}
          keyExtractor={(song) => song.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          renderItem={({ item }) => <SongRow song={item} queue={queue} />}
          keyboardShouldPersistTaps="handled"
        />
      ) : segment === 'Playlists' ? (
        <FlashList
          key="playlists"
          data={shownPlaylists}
          keyExtractor={(playlist) => playlist.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          renderItem={({ item }) => <PlaylistRow playlist={item} count={playlistCounts.get(item.id) ?? 0} />}
          keyboardShouldPersistTaps="handled"
        />
      ) : segment === 'Albums' ? (
        <FlashList
          key="albums"
          data={visible.albums}
          numColumns={3}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          keyExtractor={(album) => album.id}
          renderItem={({ item, index }) => (
            <View style={column(index)}>
              <AlbumTile
                album={item}
                size={size}
                count={albumCounts.get(item.id) ?? 0}
                noLyrics={!filters.hideUnsynced && !synced.albums.has(item.id)}
              />
            </View>
          )}
        />
      ) : (
        <FlashList
          key="artists"
          data={visible.artists}
          numColumns={3}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          keyExtractor={(artist) => artist.id}
          renderItem={({ item, index }) => {
            const albums = artistAlbums.get(item.id) ?? [];
            return (
              <View style={column(index)}>
                <ArtistTile
                  artist={item}
                  size={size}
                  cover={albums[0]}
                  albumCount={albums.length}
                  noLyrics={!filters.hideUnsynced && !synced.artists.has(item.id)}
                />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
