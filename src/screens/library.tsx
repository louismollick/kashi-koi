import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { albums, artists, songs } from '@/data/fakeData';
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

const segments = ['Albums', 'Artists', 'Songs', 'Playlists'] as const;

/** Browse local album and artist grids, song rows, and placeholder playlists. */
export default function LibraryScreen() {
  const router = useRouter();
  const [segment, setSegment] = useState<typeof segments[number]>('Albums');
  const [query, setQuery] = useState('');
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const { width } = useWindowDimensions();
  const size = (width - 56) / 3;
  const matching = songs.filter(song => `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(query.toLowerCase()));
  const source = { songs: matching, albums: albums.filter(album => matching.some(song => song.albumId === album.id)),
    artists: artists.filter(artist => matching.some(song => song.artistId === artist.id)) };
  const visible = getVisibleLibrary(hiding, source);
  const hidden = getVisibleLibrary(true, source);
  const filtered = visible.songs;
  const shownAlbums = visible.albums;
  const shownArtists = visible.artists;
  const hiddenCount = segment === 'Albums' ? source.albums.length - hidden.albums.length
    : segment === 'Artists' ? source.artists.length - hidden.artists.length : source.songs.length - hidden.songs.length;
  const shownPlaylists = filtered.slice(0, 2);
  const count = segment === 'Albums' ? shownAlbums.length : segment === 'Artists' ? shownArtists.length : segment === 'Songs' ? filtered.length : shownPlaylists.length;
  return <View style={styles.page}>
    <Header />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <PixelFrame fill={colors.surface} border="#363a5e" contentStyle={[styles.row, { paddingHorizontal: 12 }]}>
        <Icon name="search" size={20} color={colors.muted} />
        <TextInput accessibilityLabel="Search library" placeholder="Search songs, albums, artists" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={{ flex: 1, color: colors.text, height: 50, fontSize: 16 }} clearButtonMode="while-editing" />
      </PixelFrame>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {segments.map(value => <Button key={value} label={value} fill={segment === value ? colors.coral : colors.slate} border={segment === value ? '#ff9aa5' : '#4b4f80'} onPress={() => setSegment(value)} style={{ flex: 1 }} contentStyle={{ paddingHorizontal: 4 }}><Label style={{ fontSize: 14, fontWeight: '700' }}>{value}</Label></Button>)}
      </View>
      {segment !== 'Playlists' && <HiddenSongsRow count={hiddenCount} kind={segment === 'Albums' ? 'albums' : segment === 'Artists' ? 'artists' : 'songs'} />}
      {segment === 'Songs' ? <View>{filtered.map(song => <SongRow key={song.id} song={song} />)}</View> :
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {segment === 'Albums' ? shownAlbums.map(album => <AlbumTile key={album.id} album={album} size={size} />) :
            segment === 'Artists' ? shownArtists.map(artist => {
              const artistAlbums = getVisibleLibrary(hiding).albums.filter(album => album.artistId === artist.id);
              return <Pressable key={artist.id} accessibilityRole="button" accessibilityLabel={`Open artist ${artist.name}`} onPress={() => router.push({ pathname: '/library/artist/[id]', params: { id: artist.id } })} style={({ pressed }) => ({ width: size, opacity: pressed ? 0.7 : 1 })}>
                <View>
                  <Cover song={artistAlbums[0] ?? artist} size={size} />
                  {!hiding && !artistHasSyncedLyrics(artist.id) && <NoLyricsBadge />}
                </View>
                <Label numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>{artist.name}</Label>
                <Label muted style={{ fontSize: 12 }}>{artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}</Label>
              </Pressable>;
            }) : shownPlaylists.map((song, index) => <View key={song.id} style={{ width: size }}>
              <Cover song={song} size={size} />
              <Label numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>{['Dawn listening', 'Rainy afternoons'][index]}</Label>
              <Label muted numberOfLines={1} style={{ fontSize: 12 }}>{song.artist}</Label>
            </View>)}
        </View>}
      {!count && <Label muted>No matches</Label>}
    </ScrollView>
  </View>;
}
