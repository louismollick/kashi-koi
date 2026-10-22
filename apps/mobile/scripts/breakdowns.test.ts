import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import {
  breakdownStore,
  setBreakdownRuntime,
  flushBreakdowns,
  breakdownTarget,
  canExplain,
  cacheSongBreakdowns,
  englishSpans,
  loadBreakdown,
  prefetchBreakdown,
} from '../src/analysis/breakdowns';
import { cancelAnalyses, setAnalysisRuntime } from '../src/analysis/fetcher';
import { appStore, resetAppState, setAnalysisServerUrl } from '../src/store/appStore';
import { settingsStore } from '../src/store/settingsStore';
import { getLineText, getLyrics, libraryStore } from '../src/store/libraryStore';
import { toSongLyrics } from '../src/navidrome/lyrics';
import { songs, testQuiz } from './fixtures';

const persisted = new Map<string, Breakdown>();
const removed: string[] = [];
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const songId = songs[0]!.id;
let sentenceId = '',
  key = '',
  analysis: SongAnalysis;
const response = () => {
  const target = breakdownTarget(songId, sentenceId)!;
  return {
    fingerprint: target.fingerprint,
    start: target.start,
    model: 'test',
    createdAt: '2026-10-09T00:00:00Z',
    chunks: [
      {
        text: target.text,
        reading: 'かみのふねをかわにうかべた',
        role: 'topic',
        english: [],
        steps: [{ japanese: '紙', reading: 'かみ', english: 'paper' }],
        note: '',
      },
    ],
  };
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(async () => {
  setBreakdownRuntime({
    read: async (fp, start) => persisted.get(`${fp}:${start}`),
    save: async (value) => {
      persisted.set(`${value.fingerprint}:${value.start}`, value);
    },
    remove: async (fp) => {
      removed.push(fp);
      for (const key of persisted.keys()) if (key.startsWith(`${fp}:`)) persisted.delete(key);
    },
  });
  await cancelAnalyses();
  await resetAppState();
  settingsStore.setState({ analysisServerUrl: 'https://analysis.test/api', analysisToken: '' });
  persisted.clear();
  removed.length = 0;
  const lyrics = toSongLyrics(
    songId,
    {
      synced: true,
      line: [
        { start: 0, value: '紙の舟を' },
        { start: 1000, value: '川に浮かべた' },
        { start: 2000, value: '紙の舟を' },
        { start: 3000, value: '川に浮かべた' },
      ],
    },
    4000,
  );
  libraryStore.getState().setLibrary({ songs: [songs[0]!], albums: [], artists: [], lyrics: { [songId]: lyrics } });
  analysis = {
    schemaVersion: 3,
    fingerprint: lyrics.fingerprint,
    model: 'test',
    createdAt: '2026-10-08T00:00:00Z',
    title: 'Paper boat',
    about: 'A paper boat floats on the river.',
    lines: ['A paper boat', 'I floated it on the river', 'A paper boat', 'I floated it on the river'],
    sentences: [0, 2].map((start) => ({
      start,
      end: start + 1,
      translation: 'I floated a paper boat on the river',
      quiz: testQuiz('I floated a paper boat on the river'),
    })),
  };
  libraryStore.getState().setAnalysis(analysis);
  sentenceId = getLyrics(songId).sentences[0]!.id;
  key = `${lyrics.fingerprint}:0`;
  setAnalysisRuntime({ fetch: async () => new Response(null, { status: 404 }) });
});
afterEach(async () => {
  await cancelAnalyses();
  await resetAppState();
  setAnalysisRuntime();
});

test('targets use the first occurrence, fallback songs cannot explain, and URL gates Explain', () => {
  const target = breakdownTarget(songId, sentenceId)!;
  assert.equal(getLyrics(songId).sentenceTimeline.length, 2);
  assert.equal(target.start, 0);
  assert.equal(target.text, '紙の舟を\n川に浮かべた');
  assert.equal(target.translation, analysis.sentences[0]!.translation);
  assert.equal(canExplain(songId), true);
  assert.equal(breakdownTarget(songId, 'missing'), undefined);
  settingsStore.setState({ analysisServerUrl: '' });
  assert.equal(canExplain(songId), false);
  libraryStore
    .getState()
    .setLibrary({ songs: [songs[0]!], albums: [], artists: [], lyrics: libraryStore.getState().lyrics });
  assert.equal(breakdownTarget(songId, sentenceId), undefined);
  assert.equal(canExplain(songId), false);
});

test('public cached reads are shared and reused without an admin token', async () => {
  const gate = deferred();
  let calls = 0;
  setAnalysisRuntime({
    fetch: async (url, init) => {
      calls++;
      assert.equal(
        url,
        `https://analysis.test/api/v1/analyses/${encodeURIComponent(analysis.fingerprint)}/breakdowns/0`,
      );
      assert.equal(init?.headers, undefined);
      await gate.promise;
      return Response.json(response());
    },
  });
  const first = loadBreakdown(songId, sentenceId),
    second = loadBreakdown(songId, sentenceId);
  assert.equal(first, second);
  assert.equal(breakdownStore.getState().states[key]?.status, 'loading');
  gate.resolve();
  await first;
  assert.deepEqual(breakdownStore.getState().states[key], { status: 'ready', breakdown: response() });
  await loadBreakdown(songId, sentenceId);
  assert.equal(calls, 1);
});

test('404 becomes missing without a token; adding a token allows synchronous generation', async () => {
  const methods: string[] = [];
  setAnalysisRuntime({
    fetch: async (_url, init) => {
      methods.push(init?.method ?? 'GET');
      if (init?.method === 'POST') {
        assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer owner');
        return Response.json(response());
      }
      return new Response(null, { status: 404 });
    },
  });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'missing');
  settingsStore.setState({ analysisToken: 'owner' });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'ready');
  assert.deepEqual(methods, ['GET', 'GET', 'POST']);
});

test('failed and invalid responses are retryable, and a POST 404 remains missing', async () => {
  for (const result of [Response.json({ bad: true }), new Response(null, { status: 502 })]) {
    setAnalysisRuntime({ fetch: async () => result });
    await loadBreakdown(songId, sentenceId);
    assert.equal(breakdownStore.getState().states[key]?.status, 'failed');
  }
  settingsStore.setState({ analysisToken: 'owner' });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'failed');
  setAnalysisRuntime({ fetch: async () => new Response(null, { status: 404 }) });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'missing');
});

test('logout invalidates a pending GET before it can generate or publish', async () => {
  settingsStore.setState({ analysisToken: 'owner' });
  const gate = deferred();
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      await gate.promise;
      return new Response(null, { status: 404 });
    },
  });
  const work = loadBreakdown(songId, sentenceId);
  await tick();
  await cancelAnalyses();
  gate.resolve();
  await work;
  assert.equal(calls, 1);
  assert.deepEqual(breakdownStore.getState().states, {});
});

test('logout invalidates a pending POST and server changes cannot publish old responses', async () => {
  for (const cancel of [true, false]) {
    settingsStore.setState({ analysisToken: 'owner', analysisServerUrl: 'https://analysis.test/api' });
    const gate = deferred(),
      started = deferred(),
      data = response();
    setAnalysisRuntime({
      fetch: async (_url, init) => {
        if (!init?.method) return new Response(null, { status: 404 });
        started.resolve();
        await gate.promise;
        return Response.json(data);
      },
    });
    const work = loadBreakdown(songId, sentenceId);
    await started.promise;
    if (cancel) await cancelAnalyses();
    else setAnalysisServerUrl('https://other.test');
    gate.resolve();
    await work;
    assert.equal(breakdownStore.getState().states[key], undefined);
  }
});

test('a replacement analysis clears its cached explanation', async () => {
  setAnalysisRuntime({ fetch: async () => Response.json(response()) });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'ready');
  libraryStore.getState().setAnalysis({ ...analysis, title: 'Another reading' });
  assert.equal(breakdownStore.getState().states[key], undefined);
});

test('prefetch needs a token, and a miss or lost mark shares the same quiet request', async () => {
  const gate = deferred();
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      await gate.promise;
      return Response.json(response());
    },
  });
  prefetchBreakdown(songId, sentenceId);
  assert.equal(calls, 0);
  settingsStore.setState({ analysisToken: 'owner' });
  appStore.setState({ songId, lineIndex: 0, quizToggle: true });
  appStore.getState().answer('wrong');
  appStore.getState().addLostMark();
  appStore.getState().startClipReview();
  appStore.getState().answerClip('wrong');
  await tick();
  assert.equal(calls, 1);
  const work = loadBreakdown(songId, sentenceId);
  gate.resolve();
  await work;
  assert.equal(breakdownStore.getState().states[key]?.status, 'ready');
});

test('busy and usage limits show short failure messages, other errors stay generic', async () => {
  settingsStore.setState({ analysisToken: 'owner' });
  for (const [status, error] of [
    [503, 'Server busy, try again'],
    [429, 'Usage limit reached, try later'],
    [502, 'Breakdown failed'],
  ] as const) {
    setAnalysisRuntime({
      fetch: async (_url, init) => new Response(null, { status: init?.method === 'POST' ? status : 404 }),
    });
    await loadBreakdown(songId, sentenceId);
    assert.deepEqual(breakdownStore.getState().states[key], { status: 'failed', error });
  }
});

test('loads without a target or URL do not fetch or update state', async () => {
  let calls = 0,
    updates = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      return Response.json(response());
    },
  });
  const unsubscribe = breakdownStore.subscribe(() => updates++);
  try {
    await loadBreakdown(songId, 'missing');
    await loadBreakdown(null, null);
    settingsStore.setState({ analysisServerUrl: '' });
    await loadBreakdown(songId, sentenceId);
    await loadBreakdown(songId, sentenceId);
    assert.equal(calls, 0);
    assert.equal(updates, 0);
    assert.deepEqual(breakdownStore.getState().states, {});
  } finally {
    unsubscribe();
  }
});

test('replacement invalidates pending responses and reloads the same target once', async () => {
  const gate = deferred(),
    old = response();
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      if (++calls === 1) {
        await gate.promise;
        return Response.json(old);
      }
      return Response.json(response());
    },
  });
  const stale = loadBreakdown(songId, sentenceId);
  await tick();
  libraryStore.getState().setAnalysis({ ...analysis, title: 'Another reading' });
  assert.equal(breakdownStore.getState().states[key], undefined);
  const fresh = loadBreakdown(songId, sentenceId);
  assert.equal(loadBreakdown(songId, sentenceId), fresh);
  await fresh;
  gate.resolve();
  await stale;
  assert.equal(calls, 2);
  assert.deepEqual(breakdownStore.getState().states[key], { status: 'ready', breakdown: response() });
});

test('English spans assign repeated words to chunks in order and keep pieces apart', () => {
  const chunk = (english: string[]) => ({ text: 'あ', reading: '', role: 'topic', english, steps: [], note: '' });
  assert.deepEqual(englishSpans('I love you and you love me', [chunk(['you']), chunk(['you'])]), [
    { start: 7, end: 10, chunk: 0 },
    { start: 15, end: 18, chunk: 1 },
  ]);
  assert.deepEqual(
    englishSpans('Though it flits through, fine', [chunk(['Though', 'flits through']), chunk(['nope'])]),
    [
      { start: 0, end: 6, chunk: 0 },
      { start: 10, end: 23, chunk: 0 },
    ],
  );
});

test('persisted breakdowns read through after transient reset, even offline with no server URL', async () => {
  const data = response();
  persisted.set(key, data);
  settingsStore.setState({ offlineMode: true, analysisServerUrl: '' });
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      throw new Error('Offline must not fetch');
    },
  });
  await loadBreakdown(songId, sentenceId);
  assert.deepEqual(breakdownStore.getState().states[key], { status: 'ready', breakdown: data });
  assert.equal(calls, 0);
});

test('online reads persist and replacement deletes the obsolete fingerprint before another read', async () => {
  setAnalysisRuntime({ fetch: async () => Response.json(response()) });
  await loadBreakdown(songId, sentenceId);
  assert.deepEqual(persisted.get(key), response());
  libraryStore.getState().setAnalysis({ ...analysis, title: 'Replacement' });
  await flushBreakdowns();
  assert.equal(persisted.has(key), false);
  assert.ok(removed.includes(analysis.fingerprint));
});

test('download breakdown misses use GET only even with an owner token', async () => {
  settingsStore.setState({ analysisToken: 'owner' });
  const methods: string[] = [];
  setAnalysisRuntime({
    fetch: async (_url, init) => {
      methods.push(init?.method ?? 'GET');
      return new Response(null, { status: 404 });
    },
  });
  await loadBreakdown(songId, sentenceId, { cachedOnly: true });
  assert.deepEqual(methods, ['GET']);
  assert.equal(breakdownStore.getState().states[key]?.status, 'missing');
});

test('identical analysis publication preserves persisted and transient breakdowns', async () => {
  setAnalysisRuntime({ fetch: async () => Response.json(response()) });
  await loadBreakdown(songId, sentenceId);
  const before = breakdownStore.getState().states[key],
    deletes = removed.length;
  libraryStore.getState().setAnalysis(structuredClone(analysis));
  await flushBreakdowns();
  assert.deepEqual(persisted.get(key), response());
  assert.equal(breakdownStore.getState().states[key], before);
  assert.equal(removed.length, deletes);
});

test('download cancellation aborts breakdown GET and leaves the cache empty', async () => {
  const started = deferred(),
    controller = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  setAnalysisRuntime({
    fetch: async (_url, init) => {
      requestSignal = init?.signal;
      started.resolve();
      return new Promise<Response>((_resolve, reject) => {
        requestSignal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
    },
  });
  const pending = loadBreakdown(songId, sentenceId, { cachedOnly: true, signal: controller.signal });
  await started.promise;
  controller.abort();
  await pending;
  assert.equal(requestSignal?.aborted, true);
  assert.equal(persisted.has(key), false);
});

for (const update of ['replacement analysis', 'translations', 'another song analysis'] as const)
  test(`download breakdown caching ${update === 'replacement analysis' ? 'rejects' : 'allows'} mid-run ${update}`, async () => {
    const gate = deferred(),
      started = deferred(),
      originalLyrics = getLyrics(songId),
      originalAnalysis = libraryStore.getState().analyses[analysis.fingerprint];
    if (update === 'another song analysis') {
      const other = toSongLyrics(songs[1]!.id, { synced: true, line: [{ start: 0, value: '別の歌' }] }, 4000);
      libraryStore.getState().setLibrary({
        songs: [songs[0]!, songs[1]!],
        albums: [],
        artists: [],
        lyrics: { ...libraryStore.getState().lyrics, [songs[1]!.id]: other },
        analyses: libraryStore.getState().analyses,
      });
    }
    let calls = 0;
    setAnalysisRuntime({
      fetch: async (_url, init) => {
        assert.equal(init?.method ?? 'GET', 'GET');
        calls++;
        started.resolve();
        await gate.promise;
        return new Response(null, { status: 404 });
      },
    });
    const work = cacheSongBreakdowns(songId, () => true);
    const result =
      update === 'replacement analysis'
        ? assert.rejects(work, { message: 'Song analysis changed during download' })
        : assert.doesNotReject(work);
    await started.promise;
    if (update === 'replacement analysis') {
      libraryStore.getState().setAnalysis({ ...analysis, title: 'Another reading' });
      assert.notEqual(libraryStore.getState().analyses[analysis.fingerprint], originalAnalysis);
    } else if (update === 'translations') {
      const line = originalLyrics.lines[0]!;
      libraryStore.getState().applyTranslationsToSong(songId, {
        [getLineText(line)]: { translation: 'On-device translation', segments: line.segments },
      });
      assert.notEqual(getLyrics(songId), originalLyrics);
      assert.equal(getLyrics(songId).lines[0]!.translation, 'On-device translation');
      assert.equal(libraryStore.getState().analyses[analysis.fingerprint], originalAnalysis);
    } else {
      libraryStore.getState().setAnalysis({
        ...analysis,
        fingerprint: getLyrics(songs[1]!.id).fingerprint,
        lines: ['Another song'],
        sentences: [{ ...analysis.sentences[0]!, start: 0, end: 0 }],
      });
      assert.equal(libraryStore.getState().analyses[analysis.fingerprint], originalAnalysis);
    }
    gate.resolve();
    await result;
    assert.equal(calls, 1);
  });
