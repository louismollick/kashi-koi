import { downloadStore, localArtUri } from '@/downloads/store';
import { appStore } from '@/store/appStore';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { stepped, tint } from './PixelFrame';
import { Icon } from './Icon';
import { paletteFor } from '@/data/palette';
import { sessionStore } from '@/navidrome/session';
import { mediaUrl, type Session } from '@/navidrome/subsonic';
import { artStore } from '@/store/artStore';

/**
 * Two of Navidrome's sizes (150, 300, 600): rows and the mini player share 150px, grids, headers,
 * the lock screen and downloads share 600px, so each album has at most two cache entries.
 */
const coverUrl = (session: Session, coverArt: string, size: number) =>
  mediaUrl(session, 'getCoverArt', coverArt, size > 60 ? 600 : 150);

let latest: (string | undefined)[] | null = null,
  prefetching = false;
/**
 * Warm the disk cache for grid and row covers after a sync, so the first scroll doesn't wait on the server.
 * Native prefetches can't be cancelled, so small batches stop once the session changes, the app goes offline
 * or a newer request arrives, which then runs instead.
 */
export async function prefetchCovers(coverArts: (string | undefined)[]) {
  latest = coverArts;
  if (prefetching) return;
  prefetching = true;
  try {
    while (latest) {
      const ids = [...new Set(latest)].filter((id): id is string => !!id),
        session = sessionStore.getState().session;
      latest = null;
      for (let start = 0; session && start < ids.length; start += 8) {
        if (latest || sessionStore.getState().session !== session || appStore.getState().offlineMode) break;
        const urls = ids
          .slice(start, start + 8)
          .flatMap((id) => (localArtUri(id) ? [] : [coverUrl(session, id, 0), coverUrl(session, id, 600)]));
        // One request per URL, so a failure can't end the batch early. Failed covers load on demand.
        await Promise.all(urls.map((url) => Image.prefetch(url, 'disk').catch(() => false)));
      }
    }
  } finally {
    prefetching = false;
  }
}

/** Retry failed downloads twice, then leave the fish placeholder visible. */
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
      // Memory first: list cells recycle while scrolling and must not re-read the disk each time.
      cachePolicy="memory-disk"
      recyclingKey={uri}
      contentFit="cover"
      onError={() => setFailed(true)}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** Downloaded art first, then cached server art, over a faint fish while absent or loading. */
export const Cover = memo(function Cover({
  song,
  size = 44,
}: {
  song: { id: string; coverArt?: string };
  size?: number;
}) {
  const palette = paletteFor(song.id),
    coverArt = song.coverArt;
  const session = sessionStore((state) => state.session),
    offline = appStore((state) => state.offlineMode),
    version = artStore((state) => state.version),
    local = downloadStore((state) => (coverArt && state.art[coverArt] ? localArtUri(coverArt) : undefined));
  const uri = local ?? (!offline && session && coverArt ? coverUrl(session, coverArt, size) : null);
  // Sized up front: the outline draws on the first render instead of waiting for layout.
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          inset: 2,
          overflow: 'hidden',
          backgroundColor: palette.color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="fish" size={Math.round(size * 0.4)} color={tint(palette.color, 0.18)} />
        {uri && <Artwork key={`${uri}:${version}`} uri={uri} />}
      </View>
      <Svg pointerEvents="none" width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path
          d={stepped(1, 1, size - 1, size - 1, size >= 36 ? 3 : 2, 2)}
          fill="none"
          stroke={tint(palette.accent, 0.35)}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
});
