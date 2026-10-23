import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { albums, artists, firstSong, songLyrics, songs } from '@kashi-koi/core/fixtures';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { appStore, resetAppState } from '@kashi-koi/core/store/appStore';
import { libraryStore } from '@kashi-koi/core/store/libraryStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import {
  type AudioLike,
  type Clock,
  installWebTransport,
  POLL_MS,
  type SessionLike,
} from '../src/platform/webTransport';

/** A media element that behaves like the browser's in the ways the transport relies on. */
class FakeAudio extends EventTarget implements AudioLike {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  ended = false;
  seeking = false;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  muted = false;
  preload: '' | 'none' | 'metadata' | 'auto' = 'metadata';
  playCalls = 0;
  /** What play() settles to: undefined resolves, an error name rejects like the browser would. */
  playRejection: string | undefined;
  loads = 0;

  play() {
    this.playCalls++;
    this.paused = false;
    if (!this.playRejection) return Promise.resolve();
    this.paused = true;
    return Promise.reject(new DOMException('blocked', this.playRejection));
  }
  pause() {
    this.paused = true;
    this.fire('pause');
  }
  load() {
    this.loads++;
    this.duration = Number.NaN;
  }
  removeAttribute() {
    this.src = '';
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
  /** The browser finished loading the current source. */
  ready(durationSec: number) {
    this.duration = durationSec;
    this.fire('loadedmetadata');
    this.fire('canplay');
  }
  tick(timeSec: number) {
    this.currentTime = timeSec;
    this.fire('timeupdate');
  }
}

/** A FakeAudio whose `src` assignments restart the load algorithm, which resets the rate to the default, like the real property. */
function fakeAudio() {
  const audio = new FakeAudio();
  let src = '';
  Object.defineProperty(audio, 'src', {
    get: () => src,
    set: (value: string) => {
      src = value;
      audio.playbackRate = audio.defaultPlaybackRate;
    },
  });
  return audio;
}

/** A clock the test steps by hand: animation frames, intervals and tab visibility. */
function fakeClock() {
  let now = 0,
    next = 1,
    hidden = false;
  const frames = new Map<number, () => void>(),
    intervals = new Map<number, { callback: () => void; ms: number }>(),
    visibility = new Set<() => void>();
  const clock: Clock = {
    now: () => now,
    requestFrame: (callback) => {
      frames.set(next, callback);
      return next++;
    },
    cancelFrame: (id) => void frames.delete(id),
    setInterval: (callback, ms) => {
      intervals.set(next, { callback, ms });
      return next++;
    },
    clearInterval: (id) => void intervals.delete(id),
    hidden: () => hidden,
    onVisibilityChange: (callback) => {
      visibility.add(callback);
      return () => visibility.delete(callback);
    },
  };
  return {
    clock,
    frames,
    intervals,
    /** Advance time and run the frame that was waiting. */
    frame(ms: number) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
    /** Advance time and fire every interval once per its period. */
    interval(ms: number) {
      now += ms;
      for (const { callback } of intervals.values()) callback();
    },
    setHidden(value: boolean) {
      hidden = value;
      for (const callback of visibility) callback();
    },
  };
}

function fakeSession() {
  const handlers: Record<string, MediaSessionActionHandler | null> = {};
  const calls = { metadata: [] as unknown[], playbackState: [] as string[], position: [] as unknown[] };
  const session: SessionLike = {
    setMetadata: (metadata) => void calls.metadata.push(metadata),
    setPlaybackState: (state) => void calls.playbackState.push(state),
    setPositionState: (state) => void calls.position.push(state),
    setActionHandler: (action, handler) => {
      handlers[action] = handler;
    },
  };
  return { session, handlers, calls };
}

const credentials = { url: 'https://music.test', username: 'user', token: 'token', salt: 'salt' };
let dispose: (() => void) | undefined;

function setup({ muted = false } = {}) {
  const audio = fakeAudio(),
    time = fakeClock(),
    media = fakeSession();
  dispose = installWebTransport({ audio, session: media.session, clock: time.clock, muted });
  return { audio, time, media };
}

beforeEach(async () => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  sessionStore.setState({ session: credentials });
  settingsStore.setState({ playbackRate: 1, answerTime: null, offlineMode: false });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  sessionStore.setState({ session: null });
});

test('a song streams from Navidrome, silently when muted, with pitch kept at the chosen speed', () => {
  settingsStore.setState({ playbackRate: 0.75 });
  const { audio } = setup({ muted: true });
  assert.equal(audio.muted, true);
  assert.equal(audio.preservesPitch, true);
  appStore.getState().startSong(firstSong.id);
  assert.match(audio.src, /^https:\/\/music\.test\/rest\/stream/);
  // The new source reset the element to its default rate; the transport set the default itself.
  assert.equal(audio.playbackRate, 0.75);
  settingsStore.getState().cyclePlaybackRate();
  assert.equal(audio.playbackRate, 0.5);
  assert.equal(audio.defaultPlaybackRate, 0.5);
  appStore.getState().startSong(songs[1]!.id);
  assert.equal(audio.playbackRate, 0.5);
});

test('play is requested while the source loads, and loading ends when the audio is ready', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  assert.equal(audio.playCalls, 1);
  assert.equal(appStore.getState().loading, true);
  // Events before the audio is ready say nothing about playback.
  audio.tick(0);
  assert.equal(appStore.getState().loading, true);
  audio.ready(238);
  assert.equal(appStore.getState().loading, false);
  assert.equal(appStore.getState().playing, true);
  audio.tick(1);
  assert.equal(appStore.getState().positionMs, 1000);
  assert.equal(appStore.getState().durationMs, 238000);
});

test('a seek while the song loads becomes its start position', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  appStore.getState().seek(40000);
  assert.equal(audio.currentTime, 40);
  // A browser that dropped the default start position gets it again when the audio is ready.
  audio.currentTime = 0;
  audio.ready(238);
  assert.equal(audio.currentTime, 40);
});

test('events while seeking or from a replaced song do not move the store', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  audio.tick(5);
  assert.equal(appStore.getState().positionMs, 5000);
  appStore.getState().seek(60000);
  audio.seeking = true;
  audio.tick(5);
  assert.equal(appStore.getState().positionMs, 60000);
  audio.seeking = false;
  audio.currentTime = 60;
  audio.fire('seeked');
  assert.equal(appStore.getState().positionMs, 60000);
  // The next song starts loading: ticks from the old element state are ignored until it is ready.
  appStore.getState().startSong(songs[1]!.id);
  audio.tick(61);
  assert.equal(appStore.getState().positionMs, 0);
  audio.currentTime = 0;
  audio.ready(200);
  audio.tick(2);
  assert.equal(appStore.getState().positionMs, 2000);
});

test('pausing from the store pauses the element, and a stale event cannot resume it', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  appStore.getState().setPlaying(false);
  assert.equal(audio.paused, true);
  audio.fire('playing');
  audio.tick(3);
  assert.equal(appStore.getState().playing, false);
});

test('a pause or play from the OS is followed by the store', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  audio.paused = true;
  audio.fire('pause');
  assert.equal(appStore.getState().playing, false);
  audio.paused = false;
  audio.fire('playing');
  assert.equal(appStore.getState().playing, true);
});

test('an autoplay rejection leaves the store paused without an error', async () => {
  const { audio } = setup();
  audio.playRejection = 'NotAllowedError';
  appStore.getState().startSong(firstSong.id);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(appStore.getState().playing, false);
  assert.equal(appStore.getState().loading, false);
  assert.equal(appStore.getState().playbackError, null);
  // The next tap works.
  audio.playRejection = undefined;
  appStore.getState().setPlaying(true);
  assert.equal(audio.paused, false);
  assert.equal(appStore.getState().playing, true);
});

test('another play failure is reported, and an aborted play is not', async () => {
  const { audio } = setup();
  audio.playRejection = 'AbortError';
  appStore.getState().startSong(firstSong.id);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(appStore.getState().playbackError, null);
  audio.playRejection = 'NotSupportedError';
  appStore.getState().setPlaying(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(appStore.getState().playing, false);
  assert.match(appStore.getState().playbackError ?? '', /blocked/);
});

test('a relaunch restores the queue paused and loads the song on the first play', () => {
  appStore.setState({
    songId: songs[1]!.id,
    queue: [songs[1]!.id],
    queueIndex: 0,
    positionMs: 30000,
    durationMs: 200000,
  });
  const { audio } = setup();
  // Installing the transport loads nothing and plays nothing.
  assert.equal(audio.src, '');
  assert.equal(audio.playCalls, 0);
  appStore.getState().setPlaying(true);
  assert.match(audio.src, /stream/);
  assert.equal(audio.currentTime, 30);
  assert.equal(audio.playCalls, 1);
});

test('position is polled by animation frame while visible, throttled to 50 ms', () => {
  const { audio, time } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  assert.equal(time.frames.size, 1);
  assert.equal(time.intervals.size, 0);
  audio.currentTime = 1;
  for (let frame = 0; frame < 3; frame++) time.frame(16);
  assert.equal(appStore.getState().positionMs, 0);
  time.frame(16);
  assert.equal(appStore.getState().positionMs, 1000);
  audio.currentTime = 1.1;
  time.frame(16);
  assert.equal(appStore.getState().positionMs, 1000);
  time.frame(POLL_MS);
  assert.equal(appStore.getState().positionMs, 1100);
});

test('a hidden tab polls with a timer, and the switch happens while playing', () => {
  const { audio, time } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  time.setHidden(true);
  assert.equal(time.frames.size, 0);
  assert.equal(time.intervals.size, 1);
  assert.equal([...time.intervals.values()][0]?.ms, POLL_MS);
  audio.currentTime = 2;
  time.interval(POLL_MS);
  assert.equal(appStore.getState().positionMs, 2000);
  time.setHidden(false);
  assert.equal(time.intervals.size, 0);
  assert.equal(time.frames.size, 1);
});

test('polling stops when paused and resumes on play', () => {
  const { audio, time } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  appStore.getState().setPlaying(false);
  assert.equal(time.frames.size, 0);
  time.setHidden(true);
  assert.equal(time.intervals.size, 0);
  appStore.getState().setPlaying(true);
  assert.equal(time.intervals.size, 1);
});

test('a hidden tab still stops the quiz at the end of a sentence', () => {
  const { audio, time } = setup();
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  audio.ready(238);
  time.setHidden(true);
  audio.currentTime = 8.96;
  time.interval(POLL_MS);
  assert.equal(appStore.getState().answerWait, null);
  audio.currentTime = 9.01;
  time.interval(POLL_MS);
  assert.notEqual(appStore.getState().answerWait, null);
  assert.equal(audio.paused, true);
  assert.equal(appStore.getState().playing, false);
  // Polling stopped with the pause; answering and continuing resumes the song.
  assert.equal(time.intervals.size, 0);
  appStore.getState().continueAfterAnswer();
  assert.equal(audio.paused, false);
  assert.equal(appStore.getState().answerWait, null);
});

test('a visible tab stops its frame loop at a quiz pause and runs one loop after resuming', () => {
  const { audio, time } = setup();
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  audio.ready(238);
  audio.currentTime = 9.01;
  time.frame(POLL_MS);
  assert.notEqual(appStore.getState().answerWait, null);
  assert.equal(time.frames.size, 0);
  appStore.getState().continueAfterAnswer();
  assert.equal(time.frames.size, 1);
  dispose?.();
  dispose = undefined;
  assert.equal(time.frames.size, 0);
});

test('a pause event delivered after a newer play is ignored', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  appStore.getState().setPlaying(false);
  appStore.getState().setPlaying(true);
  // The earlier pause arrives late while the element is already playing again.
  audio.fire('pause');
  assert.equal(appStore.getState().playing, true);
  assert.equal(audio.paused, false);
});

test('the end of a song advances the queue', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id, [firstSong.id, songs[1]!.id]);
  audio.ready(238);
  audio.currentTime = 238;
  audio.ended = true;
  audio.paused = true;
  audio.fire('ended');
  assert.equal(appStore.getState().songId, songs[1]!.id);
  assert.equal(appStore.getState().loading, true);
});

test('Media Session gets metadata with 600px art and controls wired to the app', () => {
  const { audio, media } = setup();
  const withArt = { ...firstSong, coverArt: 'cover' };
  libraryStore.getState().setLibrary({ songs: [withArt, ...songs.slice(1)], albums, artists, lyrics: songLyrics });
  appStore.getState().startSong(withArt.id, [withArt.id, songs[1]!.id]);
  const metadata = media.calls.metadata.at(-1) as { title: string; artwork: { src: string; sizes: string }[] };
  assert.equal(metadata.title, withArt.title);
  assert.equal(metadata.artwork[0]?.sizes, '600x600');
  assert.match(metadata.artwork[0]!.src, /getCoverArt.*size=600/);
  audio.ready(238);
  assert.equal(media.handlers.seekbackward, null);
  media.handlers.pause?.({ action: 'pause' });
  assert.equal(appStore.getState().playing, false);
  media.handlers.play?.({ action: 'play' });
  assert.equal(appStore.getState().playing, true);
  media.handlers.seekto?.({ action: 'seekto', seekTime: 50 });
  assert.equal(audio.currentTime, 50);
  media.handlers.nexttrack?.({ action: 'nexttrack' });
  assert.equal(appStore.getState().songId, songs[1]!.id);
  dispose?.();
  dispose = undefined;
  assert.equal(media.handlers.play, null);
  assert.equal(media.calls.metadata.at(-1), null);
});

test('going offline releases a streamed song', () => {
  const { audio } = setup();
  appStore.getState().startSong(firstSong.id);
  audio.ready(238);
  settingsStore.setState({ offlineMode: true });
  assert.equal(audio.src, '');
  assert.equal(appStore.getState().playing, false);
  assert.equal(appStore.getState().playbackError, 'Song is not downloaded');
});
