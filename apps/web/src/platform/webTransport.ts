import {
  announceNowPlaying,
  offlineSwitch,
  playbackBlock,
  playbackSource,
  reachedPlayed,
  recordPlayed,
} from '@kashi-koi/core/audio/playback';
import { appStore, finishSong, remoteSkip, setTransport } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import type { Song } from '@kashi-koi/core/types/domain';

/**
 * The `<audio>` transport: the web counterpart of apps/mobile/src/audio/transport.ts. One media element owns audio,
 * appStore owns queue and learning state, and `@kashi-koi/core/audio/playback` decides which source plays, when a
 * song counts as played and what Navidrome hears. Everything the browser provides comes in through `TransportEnv`, so
 * tests can drive the state machine with a fake element and a manual clock.
 */

/** The slice of HTMLAudioElement the transport uses. */
export type AudioLike = Pick<
  HTMLAudioElement,
  | 'src'
  | 'currentTime'
  | 'duration'
  | 'paused'
  | 'ended'
  | 'seeking'
  | 'playbackRate'
  | 'defaultPlaybackRate'
  | 'preservesPitch'
  | 'muted'
  | 'preload'
  | 'play'
  | 'pause'
  | 'load'
  | 'removeAttribute'
> & {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/** navigator.mediaSession, reduced to what the transport drives. */
export type SessionLike = {
  setMetadata(
    metadata: {
      title: string;
      artist: string;
      album: string;
      artwork: { src: string; sizes: string }[];
    } | null,
  ): void;
  setPlaybackState(state: MediaSessionPlaybackState): void;
  setPositionState(state?: MediaPositionState): void;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
};

/** Timers and tab visibility, injectable so tests can step time. */
export type Clock = {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  setInterval(callback: () => void, ms: number): number;
  clearInterval(id: number): void;
  hidden(): boolean;
  onVisibilityChange(callback: () => void): () => void;
};

export type TransportEnv = { audio: AudioLike; session: SessionLike | null; clock: Clock; muted?: boolean };

/** How often the position reaches the store while playing. `timeupdate` alone (~4 Hz) would let quiz pauses overshoot. */
export const POLL_MS = 50;
/** The OS now-playing position is refreshed this often between events. */
const SESSION_POSITION_MS = 1000;

const audioEvents = [
  'loadedmetadata',
  'canplay',
  'playing',
  'pause',
  'seeked',
  'timeupdate',
  'durationchange',
  'ratechange',
  'ended',
  'error',
] as const;

/**
 * Install the transport on `env.audio` and return its cleanup. Playback is requested through `setTransport`; media
 * element events and a position poll report back into `appStore.updatePlayback`.
 *
 * Unlike AVPlayer, the element's state is synchronous (`paused`, `seeking`, `currentTime` are live reads), so stale
 * events cannot flip the store: handlers read the element, not the event. `revision` still guards the one async
 * answer left, the promise returned by `play()`.
 */
export function installWebTransport({ audio, session, clock, muted = false }: TransportEnv) {
  audio.preload = 'auto';
  audio.preservesPitch = true;
  audio.muted = muted;
  let song: Song | null = null,
    sourceUri: string | null = null,
    failed = false,
    submitted = false,
    finished = false,
    awaitingStart = false,
    wantsPlay = false,
    startMs = 0,
    revision = 0,
    sessionAt = Number.NEGATIVE_INFINITY;

  // A new `src` resets the element to its default rate, so both are set, and again after every load.
  const applyRate = () => {
    const rate = settingsStore.getState().playbackRate;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
  };
  const fail = (error: unknown) => {
    failed = true;
    wantsPlay = false;
    appStore.setState({
      loading: false,
      playbackError:
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Could not play this song',
      playing: false,
    });
  };

  // Media Session: lock screen, media keys and the browser's media hub.
  const setPositionState = () => {
    sessionAt = clock.now();
    if (!session || !song) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : song.duration;
    try {
      session.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(duration, Math.max(0, audio.currentTime)),
      });
    } catch {
      // Out-of-range state during a load; the next event sets it again.
    }
  };
  const setPlaybackState = () => {
    if (!session) return;
    session.setPlaybackState(!song ? 'none' : audio.paused ? 'paused' : 'playing');
  };
  const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = session
    ? {
        play: () => appStore.getState().setPlaying(true),
        pause: () => appStore.getState().setPlaying(false),
        stop: () => appStore.getState().setPlaying(false),
        seekto: ({ seekTime }) => {
          if (seekTime !== undefined && song && !appStore.getState().clipPlayback)
            appStore.getState().seek(seekTime * 1000);
        },
        nexttrack: () => remoteSkip('next'),
        previoustrack: () => remoteSkip('previous'),
        // Null handlers keep the lock screen on previous/next instead of 10 s skips.
        seekbackward: null,
        seekforward: null,
      }
    : {};
  const setHandlers = (installed: boolean) => {
    for (const [action, handler] of Object.entries(handlers) as [
      MediaSessionAction,
      MediaSessionActionHandler | null,
    ][]) {
      try {
        session?.setActionHandler(action, installed ? handler : null);
      } catch {
        // Browsers reject actions they don't support.
      }
    }
  };
  setHandlers(true);

  /** Publish the element's state to the store (and, ~1 Hz, to the OS); the single path every event and poll goes through. */
  const sync = () => {
    if (!song || awaitingStart || audio.seeking) return;
    const currentRevision = revision;
    const nativePlaying = !audio.paused && !audio.ended;
    // The element started without us (media key, headset): follow it, as long as we didn't just ask it to stop.
    if (nativePlaying && !wantsPlay) {
      wantsPlay = true;
      appStore.getState().setPlaying(true);
      // Releasing the last sentence can load another song; its first events own playback.
      if (!wantsPlay || revision !== currentRevision || awaitingStart) return;
    }
    const positionMs = audio.currentTime * 1000,
      durationMs = (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : song.duration) * 1000;
    const clip = appStore.getState().clipPlayback;
    // EOF can land just short of the duration; score the final sentence at its end.
    const playbackPositionMs = audio.ended ? durationMs : positionMs;
    // Clip controls follow what was asked for, while a buffering element still counts as playing.
    appStore
      .getState()
      .updatePlayback(playbackPositionMs, durationMs, clip ? wantsPlay && nativePlaying : nativePlaying);
    // A step that loaded or released a song (an unanswered last sentence ending the song) owns the next events.
    if (revision !== currentRevision) return;
    if (clock.now() - sessionAt >= SESSION_POSITION_MS) setPositionState();
    if (clip) return;
    if (!submitted && reachedPlayed(positionMs, durationMs)) {
      submitted = true;
      recordPlayed(song);
    }
    if (audio.ended && !finished && !appStore.getState().answerWait) {
      finished = true;
      finishSong();
    }
  };

  // Polling: frames while the tab is visible (throttled to POLL_MS), a timer while it is hidden, since frames stop
  // in background tabs and the answer-wait gate must still land at sentence ends.
  let polling = false,
    stopTimer: (() => void) | null = null;
  const schedule = () => {
    stopTimer?.();
    stopTimer = null;
    if (!polling) return;
    if (clock.hidden()) {
      const id = clock.setInterval(sync, POLL_MS);
      stopTimer = () => clock.clearInterval(id);
      return;
    }
    // `sync` can pause the transport (a quiz sentence end), which stops this loop from inside a frame, so each loop
    // checks its own flag before scheduling the next frame.
    let last = clock.now(),
      id = 0,
      stopped = false;
    const frame = () => {
      const now = clock.now();
      if (now - last >= POLL_MS) {
        last = now;
        sync();
      }
      if (!stopped) id = clock.requestFrame(frame);
    };
    id = clock.requestFrame(frame);
    stopTimer = () => {
      stopped = true;
      clock.cancelFrame(id);
    };
  };
  const setPolling = (on: boolean) => {
    if (polling === on) return;
    polling = on;
    schedule();
  };
  const stopWatchingVisibility = clock.onVisibilityChange(() => {
    if (polling) schedule();
  });

  // Request playback. A rejected play() is the browser's autoplay policy (or a superseded request), not a failure.
  const startAudio = () => {
    const request = revision;
    setPolling(true);
    let promise: Promise<void> | undefined;
    try {
      promise = audio.play();
    } catch (error) {
      fail(error);
      return;
    }
    promise?.catch((error: unknown) => {
      if (request !== revision || !wantsPlay) return;
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        // Stay paused and let the next tap start it.
        wantsPlay = false;
        setPolling(false);
        appStore.setState({ playing: false, loading: false });
      } else fail(error);
    });
  };

  const seek = (ms: number) => {
    startMs = ms;
    if (!song) return;
    // Before the metadata arrives this sets the default start position, which the browser applies when it loads.
    audio.currentTime = ms / 1000;
  };

  const transportLoad = (next: Song, offset = 0) => {
    const blocked = playbackBlock(next);
    if (blocked) {
      if (blocked.release) {
        song = null;
        awaitingStart = false;
        audio.pause();
      }
      fail(blocked.error);
      return;
    }
    ++revision;
    audio.pause();
    wantsPlay = false;
    startMs = offset;
    song = next;
    failed = false;
    submitted = false;
    finished = false;
    awaitingStart = true;
    try {
      const source = playbackSource(next);
      sourceUri = source.uri;
      audio.src = source.uri;
      applyRate();
      if (offset > 0) audio.currentTime = offset / 1000;
      session?.setMetadata({
        title: next.title,
        artist: next.artist,
        album: next.album,
        artwork: source.artworkUrl ? [{ src: source.artworkUrl, sizes: '600x600' }] : [],
      });
      announceNowPlaying(next);
    } catch (error) {
      fail(error);
    }
  };

  // The element has enough data: the loading state ends and the requested start position is confirmed.
  const onReady = () => {
    if (!song || !awaitingStart) return;
    awaitingStart = false;
    appStore.setState({ loading: false });
    if (Math.abs(audio.currentTime * 1000 - startMs) > 1000) audio.currentTime = startMs / 1000;
    setPositionState();
    setPlaybackState();
  };
  const onPause = () => {
    // A pause event delivered after a newer play() is stale: the element is playing again.
    if (!audio.paused) return;
    setPolling(false);
    setPlaybackState();
    if (!song || awaitingStart || audio.ended || audio.seeking) return;
    // Paused by the OS or headset (we clear wantsPlay before pausing ourselves).
    if (wantsPlay) {
      wantsPlay = false;
      appStore.getState().setPlaying(false);
    }
  };
  const onPlaying = () => {
    if (!song || audio.paused) return;
    setPolling(true);
    setPlaybackState();
    setPositionState();
    sync();
  };
  const onEnded = () => {
    setPolling(false);
    sync();
  };
  const onError = () => {
    if (song) fail('Could not play this song');
  };
  const listeners: Record<(typeof audioEvents)[number], () => void> = {
    loadedmetadata: () => {
      if (song) sync();
    },
    canplay: onReady,
    playing: onPlaying,
    pause: onPause,
    seeked: () => {
      setPositionState();
      sync();
    },
    timeupdate: sync,
    durationchange: sync,
    ratechange: setPositionState,
    ended: onEnded,
    error: onError,
  };
  for (const name of audioEvents) audio.addEventListener(name, listeners[name]);

  const detach = setTransport({
    load: transportLoad,
    play: () => {
      // Nothing is loaded after a relaunch (the queue and position come back paused) or after going offline: load the
      // stored song where it stopped.
      if (!song) {
        const { songId, positionMs, clipPlayback } = appStore.getState(),
          id = clipPlayback?.songId ?? songId,
          current = id ? libraryStore.getState().bySong[id] : undefined;
        if (!current) return;
        appStore.setState({ loading: true, playbackError: null });
        transportLoad(current, clipPlayback?.positionMs ?? positionMs);
      }
      if (!song || failed) return;
      wantsPlay = true;
      // Called even while the source loads: the click that asked for playback is the user gesture browsers require.
      startAudio();
    },
    pause: () => {
      wantsPlay = false;
      audio.pause();
      setPolling(false);
    },
    seek,
  });

  // Speed applies at once. Going offline must release a streamed song with nothing downloaded.
  const unsubscribeSettings = settingsStore.subscribe((settings, previous) => {
    if (settings.playbackRate !== previous.playbackRate) applyRate();
    if (!settings.offlineMode || previous.offlineMode || !song) return;
    const state = appStore.getState();
    const action = offlineSwitch(song, sourceUri);
    if (action === 'keep') return;
    if (action === 'reload') {
      const current = song,
        playing = state.playing;
      appStore.setState({ loading: true, playbackError: null });
      transportLoad(current, state.clipPlayback?.positionMs ?? state.positionMs);
      wantsPlay = playing;
    } else {
      ++revision;
      song = null;
      awaitingStart = false;
      wantsPlay = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      session?.setMetadata(null);
      setPlaybackState();
      fail('Song is not downloaded');
    }
  });

  return () => {
    unsubscribeSettings();
    ++revision;
    wantsPlay = false;
    song = null;
    setPolling(false);
    stopWatchingVisibility();
    for (const name of audioEvents) audio.removeEventListener(name, listeners[name]);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setHandlers(false);
    session?.setMetadata(null);
    session?.setPlaybackState('none');
    detach();
  };
}
