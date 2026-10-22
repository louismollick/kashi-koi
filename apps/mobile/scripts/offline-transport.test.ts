import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test, type TestContext } from 'node:test';
import { appStore, resetAppState } from '../src/store/appStore';
import { settingsStore } from '../src/store/settingsStore';
import { downloadStore } from '../src/downloads/store';
import { libraryStore } from '../src/store/libraryStore';
import { sessionStore } from '../src/navidrome/session';
import { songs, albums, artists, songLyrics } from './fixtures';

beforeEach(async () => {
  await resetAppState();
  downloadStore.setState({ entries: {}, art: {}, root: 'file:///downloads', progress: null });
  libraryStore
    .getState()
    .setLibrary({ songs: songs.map((song) => ({ ...song, coverArt: 'cover' })), albums, artists, lyrics: songLyrics });
  sessionStore.setState({ session: { url: 'https://music.test', username: 'user', salt: 'salt', token: 'token' } });
});

/** Exercise the real transport against native audio and played-time adapters only. */
async function setup(t: TestContext) {
  const sources: ({ uri?: string } | null)[] = [],
    artworks: (string | undefined)[] = [],
    played: string[] = [],
    network: string[] = [],
    plays: number[] = [],
    seeks: number[] = [];
  type Status = {
    playing: boolean;
    currentTime: number;
    duration: number;
    isLoaded: boolean;
    didJustFinish: boolean;
    isBuffering: boolean;
    error?: string;
  };
  let listener: (status: Status) => void = () => {};
  const player = {
    play() {
      plays.push(1);
    },
    pause() {},
    seekTo: async (seconds: number) => {
      seeks.push(seconds);
    },
    replace: (source: { uri?: string } | null) => {
      sources.push(source);
    },
    setActiveForLockScreen: (_active: boolean, metadata: { artworkUrl?: string }) => {
      artworks.push(metadata.artworkUrl);
    },
    clearLockScreenControls() {},
    remove() {},
    addListener: (_event: string, next: typeof listener) => {
      listener = next;
      return { remove() {} };
    },
  };
  const key = Symbol.for('kashi.offline.transport');
  const globals = globalThis as typeof globalThis & { [key]: { player: typeof player; played: string[] } | undefined };
  globals[key] = { player, played };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'expo-audio') return { url: 'test:offline-audio', shortCircuit: true };
      if (specifier === '@/navidrome/db' && context.parentURL?.includes('/src/audio/transport.ts'))
        return { url: 'test:offline-db', shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'test:offline-audio')
        return {
          format: 'commonjs',
          source:
            "exports.createAudioPlayer = () => globalThis[Symbol.for('kashi.offline.transport')].player; exports.setAudioModeAsync = async () => {}; exports.setIsAudioActiveAsync = async () => {};",
          shortCircuit: true,
        };
      if (url === 'test:offline-db')
        return {
          format: 'commonjs',
          source:
            "exports.savePlayed = async (id) => { globalThis[Symbol.for('kashi.offline.transport')].played.push(id); };",
          shortCircuit: true,
        };
      return next(url, context);
    },
  });
  let transport: typeof import('../src/audio/transport');
  try {
    transport = await import('../src/audio/transport');
  } finally {
    hooks.deregister();
  }
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    network.push(url);
    return Response.json({ 'subsonic-response': { status: 'ok' } });
  });
  const cleanup = await transport.setupTransport();
  t.after(() => {
    cleanup();
    delete globals[key];
    sessionStore.setState({ session: null });
  });
  const status = (seconds: number) =>
    listener({
      playing: true,
      currentTime: seconds,
      duration: 238,
      isLoaded: true,
      didJustFinish: false,
      isBuffering: false,
    });
  return {
    sources,
    artworks,
    played,
    network,
    plays,
    seeks,
    status,
    fail: () =>
      listener({
        playing: false,
        currentTime: 0,
        duration: 238,
        isLoaded: false,
        didJustFinish: false,
        isBuffering: false,
        error: 'Native playback failed',
      }),
  };
}
function downloaded() {
  downloadStore.setState({
    entries: { dawn: { status: 'done', fileName: 'dawn.flac', bytes: 100, createdAt: 1, updatedAt: 1 } },
    art: { cover: { fileName: 'cover.jpg', bytes: 10 } },
  });
}

test('online playback always uses pinned audio and lock-screen artwork', async (t) => {
  downloaded();
  const { sources, artworks } = await setup(t);
  appStore.getState().startSong('dawn');
  assert.deepEqual(sources, [{ uri: 'file:///downloads/audio/dawn.flac' }]);
  assert.deepEqual(artworks, ['file:///downloads/art/cover.jpg']);
});
test('offline playback saves played times locally without announcing or scrobbling', async (t) => {
  downloaded();
  settingsStore.setState({ offlineMode: true });
  const { network, played, status } = await setup(t);
  appStore.getState().startSong('dawn');
  status(0);
  await Promise.resolve();
  status(120);
  assert.deepEqual(network, []);
  assert.deepEqual(played, ['dawn']);
  assert.ok(libraryStore.getState().bySong.dawn?.played);
});
test('switching offline unloads a remote source for an undownloaded song', async (t) => {
  const { sources } = await setup(t);
  appStore.getState().startSong('dawn');
  assert.ok(sources[0]?.uri?.startsWith('https:'));
  settingsStore.setState({ offlineMode: true });
  assert.equal(sources.at(-1), null);
  assert.equal(appStore.getState().playbackError, 'Song is not downloaded');
  assert.equal(appStore.getState().playing, false);
});
test('switching offline reloads a song downloaded since playback began and preserves its position', async (t) => {
  const { sources, status, network } = await setup(t);
  appStore.getState().startSong('dawn');
  status(0);
  await Promise.resolve();
  status(30);
  downloaded();
  const requests = network.length;
  settingsStore.setState({ offlineMode: true });
  assert.deepEqual(sources.at(-1), { uri: 'file:///downloads/audio/dawn.flac' });
  assert.equal(appStore.getState().positionMs, 30000);
  assert.equal(appStore.getState().playbackError, null);
  assert.equal(network.length, requests);
});

test('ancillary error messages do not block resuming a loaded song', async (t) => {
  downloaded();
  const { plays, status } = await setup(t);
  appStore.getState().startSong('dawn');
  status(0);
  await Promise.resolve();
  for (const playbackError of [
    'Could not save Recently played',
    'Could not scrobble this song',
    'Could not announce this song to the server',
  ]) {
    appStore.getState().setPlaying(false);
    appStore.setState({ playbackError });
    const before = plays.length;
    appStore.getState().setPlaying(true);
    assert.equal(plays.length, before + 1, playbackError);
  }
});

test('native playback failure blocks resume until another song loads', async (t) => {
  downloaded();
  const { plays, status, fail } = await setup(t);
  appStore.getState().startSong('dawn');
  status(0);
  await Promise.resolve();
  fail();
  appStore.setState({ playbackError: null });
  const before = plays.length;
  appStore.getState().setPlaying(true);
  assert.equal(plays.length, before);
  appStore.getState().startSong('glass');
  status(0);
  await Promise.resolve();
  assert.equal(plays.length, before + 1);
});

for (const clip of [false, true])
  test(`leaving offline mode resumes a released song at its saved ${clip ? 'clip' : 'song'} position`, async (t) => {
    const { sources, seeks, plays, status } = await setup(t);
    appStore.getState().startSong('dawn');
    status(0);
    await Promise.resolve();
    status(30);
    if (clip) {
      appStore.setState({
        reviewList: [
          { id: 'review-dawn', songId: 'dawn', sentenceId: songLyrics.dawn!.sentences[0]!.id, kind: 'due', misses: 1 },
        ],
      });
      appStore.getState().startClipReview();
      await Promise.resolve();
      status(1);
    }
    const saved = appStore.getState(),
      positionMs = saved.clipPlayback?.positionMs ?? saved.positionMs;
    if (clip) assert.notEqual(positionMs, saved.positionMs);
    settingsStore.setState({ offlineMode: true });
    assert.equal(sources.at(-1), null);
    assert.equal(appStore.getState().playbackError, 'Song is not downloaded');
    assert.equal(appStore.getState().playing, false);
    const before = plays.length;
    settingsStore.setState({ offlineMode: false });
    appStore.getState().setPlaying(true);
    assert.equal(sources.length, 3);
    assert.deepEqual(sources.at(-1), sources[0]);
    assert.equal(plays.length, before);
    status(0);
    await Promise.resolve();
    assert.equal(seeks.at(-1), positionMs / 1000);
    assert.equal(plays.length, before + 1);
    assert.equal(appStore.getState().playing, true);
    assert.equal(appStore.getState().playbackError, null);
  });
