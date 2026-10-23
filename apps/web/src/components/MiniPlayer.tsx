import { appStore } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { Link } from '@tanstack/react-router';
import { Cover } from './Cover';
import { Marquee } from './Marquee';
import { PixelFrame } from './PixelFrame';
import { ProgressLine } from './ProgressLine';
import { IconButton, Label } from './ui';

/** Display-only song progress; subscribes on its own so the tabs don't re-render every tick. */
function MiniProgress() {
  const position = appStore((state) => state.positionMs),
    duration = appStore((state) => state.durationMs);
  return <ProgressLine progress={duration ? position / duration : 0} height={3} track="#e2d9e8" />;
}

/** The current song above the tab bar on the phone layout; opens the full player. Nothing without a song. */
export function MiniPlayer() {
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const playing = appStore((state) => state.playing);
  if (!song) return null;
  return (
    <div className="relative mx-[14px] mb-1.5">
      {/* The whole card opens the player; the play button sits above it, not inside it. */}
      <Link to="/player" aria-label="Open player" className="block">
        <PixelFrame
          fill={colors.mini}
          border="#d8cfe2"
          contentClassName="flex h-16 items-center gap-[10px] p-2 pr-[6px]"
        >
          <Cover song={song} size={48} />
          <span className="block min-w-0 flex-1 overflow-hidden">
            <Marquee key={songId} className="text-base font-bold text-bg">
              {song.title}
            </Marquee>
            <Label lines={1} className="text-[13px]" style={{ color: '#4a4560' }}>
              {song.artist}
            </Label>
          </span>
          <span className="w-11 shrink-0" />
          <span className="absolute top-0.5 right-1.5 left-1.5">
            <MiniProgress />
          </span>
        </PixelFrame>
      </Link>
      <span className="absolute top-1/2 right-[6px] -translate-y-1/2">
        <IconButton
          plain
          name={playing ? 'pause' : 'play'}
          color={colors.bg}
          iconScale={0.7}
          label={playing ? 'Pause' : 'Play'}
          onPress={() => appStore.getState().setPlaying(!playing)}
        />
      </span>
    </div>
  );
}
