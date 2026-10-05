import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { libraryStore } from '@/store/libraryStore';
import { artistHasSyncedLyrics, getVisibleLibrary } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { Header } from '@/components/Header';
import { PixelFrame } from '@/components/PixelFrame';
import { AlbumTile } from '@/components/AlbumTile';
import { NoLyricsBadge } from '@/components/NoLyricsBadge';
import { SongRow } from '@/components/SongRow';
import { HiddenSongsRow } from '@/components/HiddenSongsRow';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Button, Label, styles } from '@/components/ui';

const segments = ['Albums', 'Artists', 'Songs'] as const;
/** Virtualized grids and rows for the entire in-memory library. */
export default function LibraryScreen() {
  const router = useRouter(), { width } = useWindowDimensions();
  const [segment, setSegment] = useState<typeof segments[number]>('Albums'), [query, setQuery] = useState('');
  const songs = libraryStore(state => state.songs), albums = libraryStore(state => state.albums), artists = libraryStore(state => state.artists);
  const progress = libraryStore(state => state.progress), error = libraryStore(state => state.error);
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics), size = (width - 56) / 3;
  const source = useMemo(() => {
    const matching = songs.filter(song => `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(query.toLowerCase()));
    const albumIds = new Set(matching.map(song => song.albumId)), artistIds = new Set(matching.map(song => song.artistId));
    return { songs: matching, albums: albums.filter(album => albumIds.has(album.id)), artists: artists.filter(artist => artistIds.has(artist.id)) };
  }, [songs, albums, artists, query]);
  const visible = getVisibleLibrary(hiding, source), hidden = getVisibleLibrary(true, source);
  const kind = segment === 'Albums' ? 'albums' : segment === 'Artists' ? 'artists' : 'songs';
  const header = <View style={{ gap: 16, paddingBottom: 16 }}>
    <PixelFrame fill={colors.surface} contentStyle={[styles.row, { paddingHorizontal: 12 }]}>
      <Icon name="search" size={20} color={colors.muted} />
      <TextInput accessibilityLabel="Search library" placeholder="Search songs, albums, artists" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={{ flex: 1, color: colors.text, height: 50, fontSize: 16 }} clearButtonMode="while-editing" />
    </PixelFrame>
    <View style={{ flexDirection: 'row', gap: 6 }}>{segments.map(value => <Button key={value} label={value} fill={segment === value ? colors.coral : colors.slate} onPress={() => setSegment(value)} style={{ flex: 1 }}><Label style={{ fontWeight: '700' }}>{value}</Label></Button>)}</View>
    <HiddenSongsRow count={source[kind].length - hidden[kind].length} kind={kind} />
    {progress && <Label muted>{progress.kind === 'sync' ? 'Syncing library' : 'Checking lyrics'}… {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}</Label>}
    {error && <Label style={{ color: colors.red }}>{error}</Label>}
  </View>;
  const empty = <Label muted>{progress ? 'Your library will appear as lyrics are checked' : query ? 'No matches' : 'No visible songs'}</Label>;
  return <View style={styles.page}><Header />
    {segment === 'Songs' ? <FlatList key="songs" data={visible.songs} keyExtractor={song => song.id} contentContainerStyle={{ padding: 16 }} ListHeaderComponent={header} ListEmptyComponent={empty} renderItem={({ item }) => <SongRow song={item} />} keyboardShouldPersistTaps="handled" /> : segment === 'Albums' ?
      <FlatList key="albums" data={visible.albums} numColumns={3} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ padding: 16 }} ListHeaderComponent={header} ListEmptyComponent={empty} keyExtractor={album => album.id} renderItem={({ item }) => <View style={{ marginBottom: 16 }}><AlbumTile album={item} size={size} /></View>} /> :
      <FlatList key="artists" data={visible.artists} numColumns={3} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ padding: 16 }} ListHeaderComponent={header} ListEmptyComponent={empty} keyExtractor={artist => artist.id} renderItem={({ item }) => {
        const artistAlbums = visible.albums.filter(album => album.artistId === item.id);
        return <Pressable accessibilityRole="button" accessibilityLabel={`Open artist ${item.name}`} onPress={() => router.push({ pathname: '/library/artist/[id]', params: { id: item.id } })} style={{ width: size, marginBottom: 16 }}>
          <View><Cover song={artistAlbums[0] ?? item} size={size} />{!hiding && !artistHasSyncedLyrics(item.id) && <NoLyricsBadge />}</View>
          <Label numberOfLines={1} style={{ fontWeight: '700', marginTop: 6 }}>{item.name}</Label><Label muted>{artistAlbums.length} albums</Label>
        </Pressable>;
      }} />}
  </View>;
}
