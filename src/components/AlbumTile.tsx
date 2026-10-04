import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getAlbumSongs } from '@/data/fakeData';
import { albumHasSyncedLyrics, getVisibleSongs } from '@/data/libraryVisibility';
import { appStore } from '@/store/appStore';
import { Cover } from './Cover';
import { NoLyricsBadge } from './NoLyricsBadge';
import { Label } from './ui';
import type { Album } from '@/types/domain';

/** Shared album tile for the Library and an artist's album grid. */
export function AlbumTile({ album, size }: { album: Album; size: number }) {
  const router = useRouter();
  const hiding = appStore(state => state.hideSongsWithoutSyncedLyrics);
  const count = getVisibleSongs(getAlbumSongs(album.id), hiding).length;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open album ${album.title}`} onPress={() => router.push({ pathname: '/library/album/[id]', params: { id: album.id } })} style={({ pressed }) => ({ width: size, opacity: pressed ? 0.7 : 1 })}>
    <View>
      <Cover song={album} size={size} />
      {!hiding && !albumHasSyncedLyrics(album.id) && <NoLyricsBadge />}
    </View>
    <Label numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>{album.title}</Label>
    <Label muted numberOfLines={1} style={{ fontSize: 12 }}>{album.artist}</Label>
    <Label muted style={{ fontSize: 12 }}>{count} {count === 1 ? 'song' : 'songs'}</Label>
  </Pressable>;
}
