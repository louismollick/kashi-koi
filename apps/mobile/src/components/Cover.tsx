import { useEffect, useState } from 'react';
import { View, PixelRatio } from 'react-native';
import { Image } from 'expo-image';
import { PixelFrame, tint } from './PixelFrame';
import { paletteFor } from '@/data/palette';
import { sessionStore } from '@/navidrome/session';
import { mediaUrl } from '@/navidrome/subsonic';
import { artStore } from '@/store/artStore';

/** Retry failed downloads twice, then leave the harbor crop visible. */
function Artwork({ uri }: { uri: string }) {
  const [attempt, setAttempt] = useState(0),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!failed || attempt >= 2) return;
    const timer = setTimeout(
      () => {
        setAttempt(attempt + 1);
        setFailed(false);
      },
      500 * 2 ** attempt,
    );
    return () => clearTimeout(timer);
  }, [failed, attempt]);
  return failed ? null : (
    <Image
      key={attempt}
      source={{ uri }}
      cachePolicy="disk"
      contentFit="cover"
      onError={() => setFailed(true)}
      style={{ position: 'absolute', inset: 0 }}
    />
  );
}

/** Disk-cached server artwork, with a harbor crop while absent or unavailable. */
export function Cover({ song, size = 44 }: { song: { id: string; coverArt?: string }; size?: number }) {
  const session = sessionStore((state) => state.session),
    palette = paletteFor(song.id);
  const version = artStore((state) => state.version);
  const uri =
    session && song.coverArt ? mediaUrl(session, 'getCoverArt', song.coverArt, size * PixelRatio.get()) : null;
  const inner = size - 4,
    height = inner * 2.3,
    width = (height * 1498) / 1050;
  return (
    <PixelFrame
      fill={palette.color}
      border={tint(palette.accent, 0.35)}
      contentStyle={{ width: size, height: size, padding: 2 }}
    >
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Image
          source={require('../../assets/background.png')}
          style={{ position: 'absolute', width, height, left: -(width - inner) / 2, top: -(height - inner) / 2 }}
        />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: palette.color, opacity: 0.3 }} />
        {uri && <Artwork key={`${uri}:${version}`} uri={uri} />}
      </View>
    </PixelFrame>
  );
}
