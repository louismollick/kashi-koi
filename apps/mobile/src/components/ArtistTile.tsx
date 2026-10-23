import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cover } from './Cover';
import { downloadSheet } from './DownloadButton';
import { NoLyricsBadge } from './NoLyricsBadge';
import { Label } from './ui';
import type { Album, Artist } from '@kashi-koi/core/types/domain';

/** Artist tile for the Library grid. Parents compute `albumCount`, `cover` (the first visible album) and `noLyrics` once per list. */
export const ArtistTile = memo(function ArtistTile({
  artist,
  size,
  cover,
  albumCount,
  noLyrics,
}: {
  artist: Artist;
  size: number;
  cover?: Album;
  albumCount: number;
  noLyrics: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open artist ${artist.name}`}
      onPress={() => router.push({ pathname: '/library/artist/[id]', params: { id: artist.id } })}
      onLongPress={() => router.push(downloadSheet({ kind: 'artist', id: artist.id }))}
      style={{ width: size }}
    >
      <View>
        <Cover song={cover ?? artist} size={size} />
        {noLyrics && <NoLyricsBadge />}
      </View>
      <Label numberOfLines={1} style={{ fontWeight: '700', marginTop: 6 }}>
        {artist.name}
      </Label>
      <Label muted>{albumCount} albums</Label>
    </Pressable>
  );
});
