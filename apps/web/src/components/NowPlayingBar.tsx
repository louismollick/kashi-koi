import { appStore } from '@kashi-koi/core/store/appStore';
import { getAlbum, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { useLocation } from '@tanstack/react-router';
import { queueStore, toggleQueue } from '@/lib/panels';
import { Cover } from './Cover';
import { FogBadge } from './Fog';
import { Marquee } from './Marquee';
import { QuizSwitch, SongMenuButton } from './PlayerControls';
import { ProgressLine, time } from './ProgressLine';
import { SpeedButton } from './SpeedButton';
import { IconButton, Label } from './ui';

/** Elapsed, the scrubber and the length; subscribes on its own so the bar doesn't re-render every tick. */
function Scrubber() {
  const position = appStore((state) => state.positionMs),
    duration = appStore((state) => state.durationMs);
  return (
    <div className="flex items-center gap-3">
      <Label muted className="w-10 text-right text-xs tabular-nums">
        {time(position)}
      </Label>
      {/* The scrubber's band reaches 12px above its line; the padding gives that back. */}
      <div className="min-w-0 flex-1 pt-3">
        <ProgressLine
          progress={duration ? position / duration : 0}
          total={duration}
          onSeek={(ms) => appStore.getState().seek(ms)}
        />
      </div>
      <Label muted className="w-10 text-xs tabular-nums">
        {time(duration)}
      </Label>
    </div>
  );
}

/** The clip's progress in clip review; display only, clips don't seek. */
function ClipProgress() {
  const progress = appStore((state) => {
    const clip = state.clipPlayback;
    return clip ? Math.max(0, clip.positionMs - clip.startMs) / (clip.endMs - clip.startMs || 1) : 0;
  });
  return (
    <div className="px-[52px] pt-3 pb-1.5">
      <ProgressLine progress={progress} />
    </div>
  );
}

/**
 * The desktop's playback bar across the bottom of the window: the song on the left, transport and scrubber in the
 * middle, speed, the quiz switch, Up next and the song menu on the right. During clip review it follows the clip and
 * keeps only play. Nothing renders until there is a song.
 */
export function NowPlayingBar() {
  const onClipReview = useLocation({ select: (location) => location.pathname === '/clip-review' });
  // Clip mode only while a session runs. Its end screen gets the normal bar back, so Play resumes the song that was
  // playing rather than replaying a finished clip.
  const clipReview = appStore((state) => onClipReview && !!state.clipReview);
  // The harbor pane shows playback errors, except during clip review, where it holds the clip instead.
  const clipError = appStore((state) => (clipReview ? state.playbackError : null));
  const songId = appStore((state) => (clipReview ? state.clipPlayback?.songId : state.songId));
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const playing = appStore((state) => state.playing && (clipReview || !state.clipPlayback));
  const ended = appStore((state) => (clipReview ? !!state.clipPlayback?.ended : !!state.answerWait));
  const loading = appStore((state) => state.loading);
  const queueOpen = queueStore((state) => state.open);
  if (!song) return null;
  return (
    <section
      aria-label="Now playing"
      className="col-span-2 grid h-[84px] grid-cols-[minmax(0,1fr)_minmax(320px,560px)_minmax(0,1fr)] items-center gap-6 border-t border-slate bg-bg px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Cover song={getAlbum(song.albumId) ?? song} size={56} />
        <span className="block min-w-0 flex-1 overflow-hidden">
          <Marquee key={song.id} className="text-base font-bold">
            {song.title}
          </Marquee>
          {clipError ? (
            <span role="alert" className="block">
              <Label lines={1} className="text-[13px]" style={{ color: colors.red }}>
                {clipError}
              </Label>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Label muted lines={1} className="text-[13px]">
                {song.artist}
              </Label>
              {!clipReview && <FogBadge songId={song.id} compact />}
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-center gap-3">
          {!clipReview && (
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
            border={colors.coralBorder}
            size={48}
            label={playing ? 'Pause' : ended ? 'Replay' : 'Play'}
            disabled={loading}
            onPress={() =>
              ended && !clipReview ? appStore.getState().replayLine() : appStore.getState().setPlaying(!playing)
            }
          />
          {!clipReview && (
            <IconButton name="skipNext" size={40} label="Next song" onPress={() => appStore.getState().nextSong()} />
          )}
        </div>
        {clipReview ? <ClipProgress /> : <Scrubber />}
      </div>
      {clipReview ? (
        <span />
      ) : (
        <div className="flex items-center justify-end gap-3">
          <SpeedButton />
          <QuizSwitch song={song} />
          <IconButton
            name="queue"
            size={40}
            label={queueOpen ? 'Hide Up next' : 'Show Up next'}
            fill={queueOpen ? colors.coral : colors.panel}
            border={queueOpen ? colors.coralBorder : undefined}
            onPress={toggleQueue}
          />
          <SongMenuButton song={song} size={40} />
        </div>
      )}
    </section>
  );
}
