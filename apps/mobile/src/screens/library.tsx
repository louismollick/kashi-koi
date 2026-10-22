import { useMemo, useState } from 'react';
import { TextInput, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { colors } from '@/constants/theme';
import { libraryStore } from '@/store/libraryStore';
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
import { Button, Label, styles } from '@/components/ui';

const segments = ['Albums', 'Artists', 'Songs'] as const;
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
    artists = libraryStore((state) => state.artists);
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
  // Playing from the Songs list queues the list as shown.
  const queue = useMemo(() => visible.songs.map((song) => song.id), [visible.songs]);
  const kind = segment === 'Albums' ? 'albums' : segment === 'Artists' ? 'artists' : 'songs';
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
          >
            <Label style={{ fontWeight: '700' }}>{value}</Label>
          </Button>
        ))}
      </View>
      <HiddenSongsRow count={source[kind].length - hidden[kind].length} kind={kind} />
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
      {progress ? 'Your library will appear as lyrics are checked' : query ? 'No matches' : 'No visible songs'}
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
