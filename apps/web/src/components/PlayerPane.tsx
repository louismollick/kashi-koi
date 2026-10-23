import { appStore } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { Cover } from './Cover';
import { Mascot } from './Mascot';
import { Label } from './ui';

/**
 * The player. Phase 2 only shows what is set: the mascot while nothing plays, otherwise the song and any playback
 * error. Phase 3 replaces the body with the real player (lyrics, quiz mode, controls). The desktop shell mounts it as
 * the right pane and the phone `/player` route mounts it full screen, so this is the one place to fill.
 */
export function PlayerPane() {
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const error = appStore((state) => state.playbackError);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      {song ? (
        <>
          <Cover song={song} size={200} />
          <div className="min-w-0 max-w-full">
            <Label lines={1} className="text-[22px] leading-7 font-bold">
              {song.title}
            </Label>
            <Label muted lines={1} className="text-base">
              {song.artist}
            </Label>
          </div>
        </>
      ) : (
        <>
          <Mascot size={200} />
          <Label pixel className="text-[22px] leading-7 font-bold">
            Nothing playing
          </Label>
        </>
      )}
      {error && (
        <Label className="block" style={{ color: colors.red }}>
          {error}
        </Label>
      )}
    </div>
  );
}
