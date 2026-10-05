import { View, PixelRatio } from 'react-native';
import { Image } from 'expo-image';
import { PixelFrame, tint } from './PixelFrame';
import { paletteFor } from '@/data/palette';
import { sessionStore } from '@/navidrome/session';
import { mediaUrl } from '@/navidrome/subsonic';

/** Disk-cached server artwork, with a centered harbor crop when artwork is absent. */
export function Cover({ song, size = 44 }: { song: { id: string; coverArt?: string }; size?: number }) {
  const session = sessionStore(state => state.session), palette = paletteFor(song.id);
  const uri = session && song.coverArt ? mediaUrl(session, 'getCoverArt', song.coverArt, size * PixelRatio.get()) : null;
  const inner = size - 4, height = inner * 2.3, width = height * 1498 / 1050;
  return <PixelFrame fill={palette.color} border={tint(palette.accent, 0.35)} contentStyle={{ width: size, height: size, padding: 2 }}>
    <View style={{ flex: 1, overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} cachePolicy="disk" contentFit="cover" style={{ width: '100%', height: '100%' }} /> : <>
        <Image source={require('../../assets/background.png')} style={{ position: 'absolute', width, height, left: -(width - inner) / 2, top: -(height - inner) / 2 }} />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: palette.color, opacity: 0.3 }} />
      </>}
    </View>
  </PixelFrame>;
}
