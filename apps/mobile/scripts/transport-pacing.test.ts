import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test, type TestContext } from 'node:test';
import { setLibraryDb } from '@kashi-koi/core/navidrome/libraryDb';
import { withSentences } from '@kashi-koi/core/lyrics/sentences';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { appStore, resetAppState } from '@kashi-koi/core/store/appStore';
import { settingsStore } from '@kashi-koi/core/store/settingsStore';
import { currentSentence, getLyrics, libraryStore } from '@kashi-koi/core/store/libraryStore';
import type { RunEnd } from '@kashi-koi/core/types/domain';
import {
  albums,
  artists,
  fakeLibraryDb,
  fixtureLine,
  fixtureReviewList,
  firstSong,
  songLyrics,
  songs,
  testQuiz,
} from '@kashi-koi/core/fixtures';

// The real transport against a fake expo-audio player. These cases moved here from core's app-state tests: they pace
// quiz answers off native playback statuses, which only the expo-audio transport produces.

/** Run-end summaries carry a wall-clock `at`; compare the rest. */
const withoutTime = (runEnd: RunEnd | null) => {
  if (!runEnd) return runEnd;
  const { at: _at, ...rest } = runEnd;
  return rest;
};

// Existing state sequences choose a translation explicitly, independent of button order.
const correctAnswer = () =>
  currentSentence(appStore.getState().songId, appStore.getState().lineIndex)?.sentence.translation ?? 'no translation';

const initialState = appStore.getState();
beforeEach(() => {
  void resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  appStore.setState(
    {
      ...initialState,
      songId: firstSong.id,
      durationMs: firstSong.duration * 1000,
      playing: true,
      lineIndex: 3,
      reviewList: fixtureReviewList(),
    },
    true,
  );
});

/** Replace only native audio and SQLite; run the real transport listener and store. */
async function nativePacingRun(t: TestContext) {
  const calls: string[] = [];
  type Status = {
    playing: boolean;
    currentTime: number;
    duration: number;
    isLoaded: boolean;
    didJustFinish: boolean;
    isBuffering: boolean;
  };
  let listener: (status: Status) => void = () => {};
  const player = {
    play: () => {
      calls.push('play');
    },
    pause: () => {
      calls.push('pause');
    },
    seekTo: async (seconds: number) => {
      calls.push(`seek:${seconds}`);
    },
    replace: () => {},
    setPlaybackRate: () => {},
    setActiveForLockScreen: () => {},
    clearLockScreenControls: () => {},
    remove: () => {},
    addListener: (_event: string, callback: typeof listener) => {
      listener = callback;
      return { remove() {} };
    },
  };
  const audio = {
    createAudioPlayer: () => player,
    setAudioModeAsync: async () => {},
    setIsAudioActiveAsync: async () => {},
  };
  const audioKey = Symbol.for('kashi-koi.test.audio');
  const globals = globalThis as typeof globalThis & { [audioKey]: typeof audio | undefined };
  globals[audioKey] = audio;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'expo-audio') return { url: 'test:audio', shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === 'test:audio')
        return {
          format: 'commonjs',
          source:
            "module.exports = { createAudioPlayer: () => globalThis[Symbol.for('kashi-koi.test.audio')].createAudioPlayer(), setAudioModeAsync: async () => {}, setIsAudioActiveAsync: async () => {} };",
          shortCircuit: true,
        };
      return nextLoad(url, context);
    },
  });
  let setupTransport: typeof import('../src/audio/transport').setupTransport;
  try {
    ({ setupTransport } = await import('../src/audio/transport'));
  } finally {
    hooks.deregister();
  }
  const previousSession = sessionStore.getState().session;
  sessionStore.setState({ session: { url: 'https://music.test', username: 'user', token: 'token', salt: 'salt' } });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ 'subsonic-response': { status: 'ok' } }));
  setLibraryDb(fakeLibraryDb());
  const detach = await setupTransport();
  const status = (positionMs: number, playing: boolean, didJustFinish = false, isBuffering = false) =>
    listener({ currentTime: positionMs / 1000, duration: 238, isLoaded: true, playing, didJustFinish, isBuffering });
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  status(0, false);
  await Promise.resolve();
  calls.length = 0;
  return {
    calls,
    status,
    detach: () => {
      detach();
      sessionStore.setState({ session: previousSession });
      setLibraryDb(undefined);
      delete globals[audioKey];
    },
  };
}

test('queued native playing status keeps the wait and answering resumes after 800 ms', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    status(9000, true);
    status(9050, true);
    assert.deepEqual(appStore.getState().answerWait, {
      occurrence: getLyrics('dawn').sentenceTimeline[0],
      until: null,
    });
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().positionMs, 9050);
    assert.deepEqual(calls, ['pause']);
    appStore.getState().answer(correctAnswer());
    t.mock.timers.tick(799);
    assert.equal(appStore.getState().playing, false);
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls, ['pause', 'play']);
  } finally {
    detach();
  }
});

test('acknowledged native pause permits external resume and playback resumes after seeking', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    settingsStore.setState({ answerTime: 3 });
    status(9000, true);
    status(9050, false);
    assert.ok(appStore.getState().answerWait);
    status(9050, true);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    status(9050, true);
    assert.equal(appStore.getState().answerWait, null);
    appStore.getState().jumpToLine(1);
    await Promise.resolve();
    assert.deepEqual(calls, ['pause', 'play', 'pause', 'seek:9', 'play']);
    t.mock.timers.tick(3000);
    assert.deepEqual(calls, ['pause', 'play', 'pause', 'seek:9', 'play']);
  } finally {
    detach();
  }
});

for (const eof of ['before wait', 'during wait'] as const) {
  for (const release of ['answer', 'external resume'] as const)
    test(`native EOF ${eof} holds the last line until ${release}`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const { calls, status, detach } = await nativePacingRun(t);
      try {
        const lyrics = getLyrics('dawn'),
          index = lyrics.timeline.length - 1;
        libraryStore.setState({
          lyrics: {
            ...libraryStore.getState().lyrics,
            dawn: withSentences({
              ...lyrics,
              timeline: lyrics.timeline.map((occurrence, i) =>
                i === index ? { ...occurrence, endMs: 238000 } : occurrence,
              ),
            }),
          },
        });
        appStore.getState().jumpToLine(index);
        await Promise.resolve();
        appStore.setState({ queue: ['dawn', 'glass'], queueIndex: 0 });
        calls.length = 0;
        if (eof === 'during wait') status(238000, true);
        status(238000, false, true);
        assert.equal(appStore.getState().answerWait?.occurrence.end, index);
        assert.equal(appStore.getState().runEnd, null);
        assert.deepEqual(calls, ['pause']);
        if (release === 'answer') {
          appStore.getState().answer(correctAnswer());
          t.mock.timers.tick(800);
        } else {
          // The EOF status started a new pause; acknowledge it before external Play.
          status(238000, false);
          status(238000, true);
        }
        assert.equal(appStore.getState().answerWait, null);
        assert.deepEqual(appStore.getState().run.answers, {});
        assert.equal(appStore.getState().playing, true);
        assert.equal(appStore.getState().songId, 'glass');
        assert.equal(appStore.getState().loading, true);
        assert.deepEqual(calls, ['pause', 'pause']);
        status(0, false);
        await Promise.resolve();
        assert.equal(calls.at(-1), 'play');
        assert.equal(appStore.getState().answerWait, null);
      } finally {
        detach();
      }
    });
}

for (const answerTime of [0, 3] as const)
  test(`native EOF short of duration counts the last unanswered miss with answer time ${answerTime}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { status, detach } = await nativePacingRun(t);
    try {
      const lyrics = getLyrics('dawn'),
        index = lyrics.timeline.length - 1;
      libraryStore.setState({
        lyrics: {
          ...libraryStore.getState().lyrics,
          dawn: withSentences({
            ...lyrics,
            timeline: lyrics.timeline.map((occurrence, i) =>
              i === index ? { ...occurrence, endMs: 238000 } : occurrence,
            ),
          }),
        },
      });
      appStore.getState().jumpToLine(index);
      await Promise.resolve();
      const sentenceId = currentSentence('dawn', index)!.sentence.id;
      settingsStore.setState({ answerTime });
      appStore.setState({ queue: ['dawn', 'glass'], queueIndex: 0 });
      status(237990, false, true);
      if (answerTime !== 0) {
        assert.equal(appStore.getState().answerWait?.occurrence.end, index);
        assert.equal(appStore.getState().runEnd, null);
        t.mock.timers.tick(3000);
      }
      assert.deepEqual(withoutTime(appStore.getState().runEnd), {
        songId: 'dawn',
        hits: 0,
        answered: 1,
        bestCombo: 0,
        perfect: false,
      });
      assert.equal(appStore.getState().reviewList.find((item) => item.sentenceId === sentenceId)?.kind, 'due');
      assert.equal(appStore.getState().songId, 'glass');
      assert.equal(appStore.getState().queueIndex, 1);
      status(237990, false, true);
      t.mock.timers.tick(5000);
      assert.equal(appStore.getState().songId, 'glass');
      assert.equal(appStore.getState().queueIndex, 1);
    } finally {
      detach();
    }
  });

test('native loaded status ends loading and clip EOF does not mark played, scrobble or advance songs', async (t) => {
  const { status, detach } = await nativePacingRun(t);
  try {
    assert.equal(appStore.getState().loading, false);
    const fetches = t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ 'subsonic-response': { status: 'ok' } }),
    );
    const played = t.mock.method(libraryStore.getState(), 'markPlayed', () => {});
    const next = t.mock.method(appStore.getState(), 'nextSong', () => {});
    appStore.setState({
      reviewList: [{ id: 'end', songId: 'glass', sentenceId: fixtureLine('glass-0'), kind: 'due', misses: 1 }],
    });
    appStore.getState().startClipReview();
    status(0, false);
    await Promise.resolve();
    status(238000, false, true);
    assert.equal(fetches.mock.callCount(), 0);
    assert.equal(played.mock.callCount(), 0);
    assert.equal(next.mock.callCount(), 0);
    assert.equal(appStore.getState().clipReview?.index, 0);
    assert.equal(appStore.getState().playing, false);
  } finally {
    detach();
  }
});

test('native EOF finishes a clip even when its final position is short of duration', async (t) => {
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    appStore.setState({
      reviewList: [{ id: 'native', songId: 'dawn', sentenceId: fixtureLine('dawn-0'), kind: 'new' }],
    });
    appStore.getState().startClipReview();
    status(0, false);
    await Promise.resolve();
    const clip = appStore.getState().clipPlayback!;
    appStore.setState({ clipPlayback: { ...clip, endMs: 240000 } });
    status(237990, false, true);
    assert.equal(appStore.getState().clipPlayback?.ended, true);
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().clipReview?.index, 0);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    await Promise.resolve();
    assert.ok(calls.includes(`seek:${clip.startMs}`));
    assert.equal(appStore.getState().clipPlayback?.ended, false);
  } finally {
    detach();
  }
});

test('native clip pause and resume follow lock-screen controls while seek, buffering and queued statuses remain guarded', async (t) => {
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    appStore.setState({
      reviewList: [{ id: 'native', songId: 'dawn', sentenceId: fixtureLine('dawn-0'), kind: 'new' }],
    });
    appStore.getState().startClipReview();
    status(0, false);
    assert.equal(appStore.getState().playing, true);
    await Promise.resolve();
    status(0, false, false, true);
    assert.equal(appStore.getState().playing, true);
    status(1000, true);
    status(1200, false);
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().clipPlayback?.positionMs, 1200);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    assert.deepEqual(calls, ['play']);
    status(1300, true);
    appStore.getState().setPlaying(false);
    status(1350, true);
    assert.equal(appStore.getState().playing, false);
    status(1350, false);
    status(1350, true);
    assert.equal(appStore.getState().playing, true);
    assert.ok(appStore.getState().clipPlayback);
    assert.equal(appStore.getState().clipReview?.index, 0);
  } finally {
    detach();
  }
});

test('native EOF preserves results for an analysis-only quiz', async (t) => {
  const lyrics = withSentences({
    songId: 'dawn',
    lines: [{ id: 'paper', segments: [{ text: '紙の舟を流した' }] }],
    timeline: [{ lineId: 'paper', startMs: 0, endMs: 238000 }],
  });
  libraryStore.getState().setLibrary({ songs: [firstSong], albums, artists, lyrics: { dawn: lyrics } });
  libraryStore.getState().setAnalysis({
    schemaVersion: 3,
    fingerprint: lyrics.fingerprint,
    model: 'test',
    createdAt: '2026-10-08T00:00:00Z',
    title: 'Paper boat',
    about: 'A walker floats a paper boat.',
    lines: ['I floated a paper boat.'],
    sentences: [
      { start: 0, end: 0, translation: 'I floated a paper boat.', quiz: testQuiz('I floated a paper boat.') },
    ],
  });
  const native = await nativePacingRun(t);
  try {
    assert.equal(getLyrics('dawn').lines[0]!.translation, undefined);
    appStore.getState().answer('I floated a paper boat.');
    native.status(238000, false, true);
    assert.deepEqual(appStore.getState().run.answers, {});
    assert.equal(appStore.getState().songId, 'dawn');
  } finally {
    native.detach();
  }
});
