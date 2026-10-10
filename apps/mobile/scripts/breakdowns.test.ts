import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import {
  breakdownStore,
  breakdownTarget,
  canExplain,
  loadBreakdown,
  prefetchBreakdown,
} from '../src/analysis/breakdowns';
import { cancelAnalyses, setAnalysisRuntime } from '../src/analysis/fetcher';
import { appStore, resetAppState } from '../src/store/appStore';
import { getLyrics, libraryStore } from '../src/store/libraryStore';
import { toSongLyrics } from '../src/navidrome/lyrics';
import { songs, testQuiz } from './fixtures';

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
        english: '',
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
  await cancelAnalyses();
  await resetAppState();
  appStore.setState({ analysisServerUrl: 'https://analysis.test/api', analysisToken: '' });
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
  appStore.setState({ analysisServerUrl: '' });
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
  appStore.setState({ analysisToken: 'owner' });
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
  appStore.setState({ analysisToken: 'owner' });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'failed');
  setAnalysisRuntime({ fetch: async () => new Response(null, { status: 404 }) });
  await loadBreakdown(songId, sentenceId);
  assert.equal(breakdownStore.getState().states[key]?.status, 'missing');
});

test('logout invalidates a pending GET before it can generate or publish', async () => {
  appStore.setState({ analysisToken: 'owner' });
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
  await cancelAnalyses();
  gate.resolve();
  await work;
  assert.equal(calls, 1);
  assert.deepEqual(breakdownStore.getState().states, {});
});

test('logout invalidates a pending POST and server changes cannot publish old responses', async () => {
  for (const cancel of [true, false]) {
    appStore.setState({ analysisToken: 'owner', analysisServerUrl: 'https://analysis.test/api' });
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
    else appStore.getState().setAnalysisServerUrl('https://other.test');
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
  appStore.setState({ songId, lineIndex: 0, analysisToken: 'owner', quizToggle: true });
  appStore.getState().answer('wrong');
  appStore.getState().addLostMark();
  appStore.getState().startClipReview();
  appStore.getState().answerClip('wrong');
  assert.equal(calls, 1);
  const work = loadBreakdown(songId, sentenceId);
  gate.resolve();
  await work;
  assert.equal(breakdownStore.getState().states[key]?.status, 'ready');
});

test('busy and usage limits show short failure messages, other errors stay generic', async () => {
  appStore.setState({ analysisToken: 'owner' });
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
    appStore.setState({ analysisServerUrl: '' });
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
