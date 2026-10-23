import { paletteFor } from '@kashi-koi/core/data/palette';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { mediaUrl, type Session } from '@kashi-koi/core/navidrome/subsonic';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { steppedPolygon, tint } from '@kashi-koi/design/shape';
import { memo, useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Two of Navidrome's sizes (150, 300, 600): rows and the mini player share 150px, grids, headers and the player
 * share 600px, so each album has at most two cache entries.
 */
const coverUrl = (session: Session, coverArt: string, size: number) =>
  mediaUrl(session, 'getCoverArt', coverArt, size > 60 ? 600 : 150);

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
    <img
      key={attempt}
      src={uri}
      alt=""
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * Cover art over a faint fish while absent or loading, in a frame tinted by the song's generated palette. Pass an
 * album, playlist or artist, or any object with an id and an optional `coverArt`.
 */
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
    offline = settingsStore((state) => state.offlineMode);
  const uri = !offline && session && coverArt ? coverUrl(session, coverArt, size) : null;
  const clipPath = steppedPolygon(size >= 36 ? 3 : 2, 2);
  // The accent outline is the bottom layer; the art sits in a layer inset 2px, both clipped to the pixel corners.
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span aria-hidden className="absolute inset-0" style={{ background: tint(palette.accent, 0.35), clipPath }} />
      <span
        aria-hidden
        className="absolute inset-[2px] flex items-center justify-center overflow-hidden"
        style={{ background: palette.color, clipPath }}
      >
        <Icon name="fish" size={Math.round(size * 0.4)} color={tint(palette.color, 0.18)} />
        {uri && <Artwork key={uri} uri={uri} />}
      </span>
    </span>
  );
});
