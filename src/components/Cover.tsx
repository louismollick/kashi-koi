import { View } from 'react-native';
import { Image } from 'expo-image';
import { PixelFrame, tint } from './PixelFrame';
import type { Song } from '@/types/domain';

// Zoomed crops of the harbor art stand in for album covers until Navidrome art is wired up.
// Each crop is the [x, y] position of the window within the art, from 0 to 1, keyed by fake song id.
const crops: Record<string, readonly [number, number]> = {
  dawn: [0.75, 0.6], glass: [0.92, 0.4], rain: [0.05, 0.75], dream: [0.5, 0.15], bluebird: [0.2, 0.35], summer: [0.35, 0.9],
};
const artAspect = 1498 / 1050;
const zoom = 2.3;

/** Square artwork for songs, albums, and artists, using their palette and crop ID. */
export function Cover({ song, size = 44 }: { song: Pick<Song, 'id' | 'color' | 'accent'>; size?: number }) {
  const [x, y] = crops[song.id] ?? crops[song.id.split('-song-')[0]!] ?? [0.5, 0.5];
  const inner = size - 4;
  const height = inner * zoom;
  const width = height * artAspect;
  return <PixelFrame fill={song.color} border={tint(song.accent, 0.35)} contentStyle={{ width: size, height: size, padding: 2 }}>
    <View style={{ flex: 1, borderRadius: size > 60 ? 5 : 3, overflow: 'hidden' }}>
      <Image source={require('../../assets/background.png')} contentFit="fill" style={{ position: 'absolute', width, height, left: -x * (width - inner), top: -y * (height - inner) }} />
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: song.color, opacity: 0.3 }} />
    </View>
  </PixelFrame>;
}
