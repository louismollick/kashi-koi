import { appStore } from '@kashi-koi/core/store/appStore';
import { getAlbum, libraryStore } from '@kashi-koi/core/store/libraryStore';
import { colors } from '@kashi-koi/design/tokens';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useRef } from 'react';
import { Cover } from '@/components/Cover';
import { FogBadge } from '@/components/Fog';
import { ScreenHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { ProgressLine, time } from '@/components/ProgressLine';
import { Screen } from '@/components/Screen';
import { SpeedButton } from '@/components/SpeedButton';
import { UpNext } from '@/components/UpNext';
import { IconButton, Label } from '@/components/ui';
import { desktopQuery } from '@/hooks/useIsDesktop';
import { useElementWidth } from '@/hooks/useElementWidth';
import { openMenuFrom } from '@/lib/songMenu';

// The full player is the phone layout's; the desktop pane already has Up next.
export const Route = createFileRoute('/_app/full-player')({
  beforeLoad: () => {
    if (window.matchMedia(desktopQuery).matches) throw redirect({ to: '/' });
  },
  component: FullPlayerScreen,
});

/** Scrubber and elapsed/remaining times; subscribes on its own so the queue doesn't re-render every tick. */
function Scrubber() {
  const position = appStore((state) => state.positionMs),
    duration = appStore((state) => state.durationMs);
  return (
    <div className="flex flex-col gap-1.5">
      <ProgressLine
        progress={duration ? position / duration : 0}
        total={duration}
        onSeek={(ms) => appStore.getState().seek(ms)}
      />
      <div className="flex justify-between px-4">
        <Label muted className="text-xs tabular-nums">
          {time(position)}
        </Label>
        <Label muted className="text-xs tabular-nums">
          -{time(Math.max(0, duration - position))}
        </Label>
      </div>
    </div>
  );
}

/** The slim bar grown up: cover, fog, scrubber, transport, then a reorderable Up next and the start of autoplay. */
function FullPlayerScreen() {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const songId = appStore((state) => state.songId);
  const song = libraryStore((state) => (songId ? state.bySong[songId] : undefined));
  const playing = appStore((state) => state.playing && !state.clipPlayback);
  const loading = appStore((state) => state.loading);
  const waiting = appStore((state) => !!state.answerWait);
  const repeat = appStore((state) => !!songId && state.repeatSongId === songId);
  if (!song)
    return (
      <Screen header={<ScreenHeader sheet />}>
        <Label muted className="block p-4">
          No song playing
        </Label>
      </Screen>
    );
  const cover = Math.max(120, Math.min(width - 96, 300));
  return (
    <Screen
      header={
        <ScreenHeader
          sheet
          right={
            <div className="flex items-center gap-[14px]">
              <SpeedButton />
              <IconButton
                name="more"
                label="Song menu"
                onPress={(event) => openMenuFrom(event.currentTarget, { kind: 'song', id: song.id })}
              />
            </div>
          }
        />
      }
    >
      <div ref={box} className="mx-auto max-w-[520px]">
        <div className="flex flex-col gap-[18px] pb-2">
          <button
            type="button"
            aria-label={`Song menu for ${song.title}`}
            onClick={(event) => openMenuFrom(event.currentTarget, { kind: 'song', id: song.id })}
            className="flex flex-col gap-4 text-left transition-opacity active:opacity-80"
          >
            <span className="flex justify-center pt-1">
              <Cover song={getAlbum(song.albumId) ?? song} size={cover} />
            </span>
            <span className="flex items-end gap-[10px] px-4">
              <span className="block min-w-0 flex-1">
                <Label lines={1} className="text-[22px] leading-7 font-bold">
                  {song.title}
                </Label>
                <Label muted lines={1}>
                  {song.artist} · {song.album}
                </Label>
                {repeat && (
                  <span className="flex items-center gap-1 pt-0.5">
                    <Icon name="repeat" color={colors.lavender} size={16} />
                    <Label className="text-[13px] font-bold text-lavender">Repeating</Label>
                  </span>
                )}
              </span>
              <FogBadge songId={song.id} />
            </span>
          </button>
          <Scrubber />
          <div className="flex items-center justify-center gap-7">
            <IconButton
              name="skipPrevious"
              size={52}
              label="Previous song"
              onPress={() => appStore.getState().skipBack()}
            />
            <IconButton
              name={playing ? 'pause' : waiting ? 'refresh' : 'play'}
              fill={colors.coral}
              size={68}
              label={playing ? 'Pause' : waiting ? 'Replay' : 'Play'}
              disabled={loading}
              onPress={() => (waiting ? appStore.getState().replayLine() : appStore.getState().setPlaying(!playing))}
            />
            <IconButton name="skipNext" size={52} label="Next song" onPress={() => appStore.getState().nextSong()} />
          </div>
        </div>
        <UpNext />
      </div>
    </Screen>
  );
}
