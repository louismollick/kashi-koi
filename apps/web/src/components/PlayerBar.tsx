import { appStore } from '@kashi-koi/core/store/appStore';
import { getAlbum, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { Cover } from './Cover';
import { Marquee } from './Marquee';
import { ProgressLine } from './ProgressLine';
import { IconButton, Label } from './ui';
import { colors } from '@kashi-koi/design/tokens';

/** Bar progress (clip progress in clip review); subscribes on its own so the bar doesn't re-render every tick. */
function BarProgress({ clipReview, seekable }: { clipReview: boolean; seekable: boolean }) {
  const progress = appStore((state) => {
    const clip = clipReview ? state.clipPlayback : null;
    const elapsed = clip ? Math.max(0, clip.positionMs - clip.startMs) : state.positionMs;
    const total = clip ? clip.endMs - clip.startMs : state.durationMs;
    return total ? elapsed / total : 0;
  });
  const total = appStore((state) => state.durationMs);
  return (
    <ProgressLine
      progress={progress}
      total={total}
      onSeek={seekable ? (ms) => appStore.getState().seek(ms) : undefined}
    />
  );
}

/**
 * Progress, song, play/pause and next under the song screen. Tapping the song (or swiping up on the bar) opens the
 * full player on the phone; the desktop pane has no full player, so it adds Previous and a scrubbable line instead.
 * Clip review shows clip progress, keeps only play and doesn't open the full player.
 */
export function PlayerBar({ clipReview = false }: { clipReview?: boolean }) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const clipEnded = appStore((state) => !!state.clipPlayback?.ended);
  const songId = appStore((state) => (clipReview ? state.clipPlayback?.songId : state.songId));
  const waiting = appStore((state) => !!state.answerWait);
  const loading = appStore((state) => state.loading);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const playing = appStore((state) => state.playing && (clipReview || !state.clipPlayback));
  if (!song) return null;
  const ended = clipReview ? clipEnded : waiting;
  const open = () => void navigate({ to: '/full-player' });
  const fullPlayer = !clipReview && !desktop;
  const info = (
    <>
      <Cover song={getAlbum(song.albumId) ?? song} size={50} />
      <span className="block min-w-0 flex-1 overflow-hidden">
        <Marquee key={song.id} className="text-base font-bold">
          {song.title}
        </Marquee>
        <Label muted lines={1} className="text-[13px]">
          {song.artist}
        </Label>
      </span>
    </>
  );
  return (
    <div className="shrink-0 bg-panel pb-[max(calc(env(safe-area-inset-bottom)-4px),14px)]">
      <BarProgress clipReview={clipReview} seekable={desktop && !clipReview} />
      <div
        className="flex items-center gap-[10px] px-4 pt-3"
        // An upward swipe on the bar opens the full player.
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (
            fullPlayer &&
            start &&
            event.clientY - start.y < -24 &&
            Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x)
          )
            open();
        }}
      >
        {fullPlayer ? (
          <button
            type="button"
            aria-label={`Open full player for ${song.title}`}
            onClick={open}
            className="flex min-w-0 flex-1 items-center gap-[10px] text-left transition-opacity active:opacity-70"
          >
            {info}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-[10px]">{info}</div>
        )}
        {desktop && !clipReview && (
          <IconButton
            name="skipPrevious"
            size={40}
            label="Previous song"
            onPress={() => appStore.getState().skipBack()}
          />
        )}
        <IconButton
          name={playing ? 'pause' : ended ? 'refresh' : 'play'}
          fill={colors.coral}
          size={52}
          label={playing ? 'Pause' : ended ? 'Replay' : 'Play'}
          disabled={loading}
          onPress={() =>
            ended && !clipReview ? appStore.getState().replayLine() : appStore.getState().setPlaying(!playing)
          }
        />
        {!clipReview && (
          <IconButton
            name="skipNext"
            size={desktop ? 40 : 46}
            label="Next song"
            onPress={() => appStore.getState().nextSong()}
          />
        )}
      </div>
    </div>
  );
}
