import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cover } from './Cover';
import { downloadSheet } from './DownloadButton';
import { NoLyricsBadge } from './NoLyricsBadge';
import { Label } from './ui';
import type { Album } from '@/types/domain';

/** Shared album tile for the Library and an artist's album grid. Parents compute `count` and `noLyrics` once per list. */
export const AlbumTile = memo(function AlbumTile({
  album,
  size,
  count,
  noLyrics,
}: {
  album: Album;
  size: number;
  count: number;
  noLyrics: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open album ${album.title}`}
      onPress={() => router.push({ pathname: '/library/album/[id]', params: { id: album.id } })}
      onLongPress={() => router.push(downloadSheet({ kind: 'album', id: album.id }))}
      style={({ pressed }) => ({ width: size, opacity: pressed ? 0.7 : 1 })}
    >
      <View>
        <Cover song={album} size={size} />
        {noLyrics && <NoLyricsBadge />}
      </View>
      <Label numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', marginTop: 6 }}>
        {album.title}
      </Label>
      <Label muted numberOfLines={1} style={{ fontSize: 12 }}>
        {album.artist}
      </Label>
      <Label muted style={{ fontSize: 12 }}>
        {count} {count === 1 ? 'song' : 'songs'}
      </Label>
    </Pressable>
  );
});
