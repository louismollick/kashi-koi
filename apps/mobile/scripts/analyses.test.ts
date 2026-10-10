import { testDecoys } from './fixtures';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import {
  analyzeSong,
  cancelAnalyses,
  fetchLibraryAnalyses,
  loadAnalysisToken,
  prioritizeAnalyses,
  setAnalysisRuntime,
  saveAnalysisToken,
} from '../src/analysis/fetcher';
import { appStore, canAnalyze, hydrateAppState, resetAppState } from '../src/store/appStore';
import { getLyrics, hasTranslations, libraryStore } from '../src/store/libraryStore';
import { toSongLyrics } from '../src/navidrome/lyrics';
import { songs } from './fixtures';

let launch = 0;
const analysisFor = (id: string): SongAnalysis => {
  const lyrics = getLyrics(id);
  return {
    schemaVersion: 2,
    fingerprint: lyrics.fingerprint,
    model: 'test',
    createdAt: '2026-10-08T00:00:00Z',
    title: 'Paper boats',
    summary: 'A speaker follows a paper boat.',
    speaker: 'A walker',
    addressee: 'Unclear',
    lines: lyrics.timeline.map((_, index) => `Context ${index}`),
    sentences: lyrics.timeline.map((_, index) => ({
      start: index,
      end: index,
      translation: `Sentence ${index}`,
      decoys: testDecoys(`Sentence ${index}`),
    })),
  };
};
beforeEach(async () => {
  await cancelAnalyses();
  await resetAppState();
  appStore.setState({ analysisServerUrl: `https://analysis-${launch++}.test`, analysisToken: 'test-token' });
  const targets = Array.from({ length: 8 }, (_, index) => ({ ...songs[0]!, id: String(index) }));
  libraryStore.getState().setLibrary({
    songs: targets,
    albums: [],
    artists: [],
    lyrics: Object.fromEntries(
      targets.map((song, index) => [
        song.id,
        toSongLyrics(
          song.id,
          {
            synced: true,
            line: [
              { start: 0, value: `紙の舟を見た${index}` },
              { start: 1000, value: '川へ歩いた' },
            ],
          },
          2000,
        ),
      ]),
    ),
  });
  setAnalysisRuntime({
    fetch: async () => new Response(null, { status: 404 }),
    save: async () => {},
    sleep: async () => {},
    loadToken: async () => 'stored-token',
    saveToken: async () => {},
  });
});
afterEach(async () => {
  await cancelAnalyses();
  setAnalysisRuntime();
});

test('four reads run at once and playback plus queue lead the library', async () => {
  const calls: string[] = [],
    releases: (() => void)[] = [];
  let active = 0,
    peak = 0;
  const idsByHash = new Map(
    Object.entries(libraryStore.getState().lyrics).map(([id, lyrics]) => [lyrics.fingerprint, id]),
  );
  setAnalysisRuntime({
    fetch: async (url) => {
      const hash = decodeURIComponent(String(url).split('/').at(-1)!);
      calls.push(idsByHash.get(hash)!);
      peak = Math.max(peak, ++active);
      if (calls.length <= 4) await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return new Response(null, { status: 404 });
    },
    save: async () => {},
  });
  appStore.setState({ songId: '6', playbackQueue: ['7', '5'] });
  const work = fetchLibraryAnalyses();
  assert.deepEqual(calls, ['6', '7', '5', '0']);
  // A new playing song jumps ahead of waiting library work.
  const same = prioritizeAnalyses(['4']);
  releases.forEach((release) => {
    release();
  });
  await Promise.all([work, same]);
  assert.equal(peak, 4);
  assert.equal(calls[4], '4');
  assert.deepEqual(new Set(calls), new Set(['0', '1', '2', '3', '4', '5', '6', '7']));
});

test('404s, network failures and invalid analyses stay silent and are tried once this launch', async () => {
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 404 });
      if (calls === 2) throw new Error('offline');
      return Response.json({ ...analysisFor('2'), lines: [] });
    },
    save: async () => assert.fail('Invalid analyses must not be saved'),
  });
  await prioritizeAnalyses(['0', '1', '2']);
  await prioritizeAnalyses(['0', '1', '2']);
  assert.equal(calls, 3);
  assert.deepEqual(libraryStore.getState().analyses, {});
  assert.deepEqual(appStore.getState().analysisRequests, {});
});

test('cached analyses skip reads and successful reads translate without Apple', async () => {
  const saved: SongAnalysis[] = [];
  libraryStore.getState().setAnalysis(analysisFor('0'));
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      return Response.json(analysisFor('1'));
    },
    save: async (analysis) => {
      saved.push(analysis);
    },
  });
  await prioritizeAnalyses(['0', '1']);
  assert.equal(calls, 1);
  assert.equal(saved.length, 1);
  assert.equal(hasTranslations('1'), true);
  assert.equal(getLyrics('1').analysis?.title, 'Paper boats');
});

test('analyzeSong posts ordered lines and polls queued, running, then saves success', async () => {
  const analysis = analysisFor('0'),
    statuses: string[] = [],
    sleeps: number[] = [],
    saved: SongAnalysis[] = [];
  const unsubscribe = appStore.subscribe((state) => {
    const status = state.analysisRequests['0']?.status;
    if (status) statuses.push(status);
  });
  let gets = 0;
  setAnalysisRuntime({
    fetch: async (_url, options) => {
      if (options?.method === 'POST') {
        assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-token');
        assert.deepEqual(JSON.parse(String(options.body)), {
          title: songs[0]!.title,
          artist: songs[0]!.artist,
          lines: ['紙の舟を見た0', '川へ歩いた'],
          force: true,
        });
        return Response.json({ fingerprint: analysis.fingerprint, status: 'queued' }, { status: 202 });
      }
      return ++gets === 1 ? Response.json({ status: 'running' }, { status: 202 }) : Response.json(analysis);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    save: async (item) => {
      saved.push(item);
    },
  });
  try {
    await appStore.getState().analyzeSong('0', { force: true });
  } finally {
    unsubscribe();
  }
  assert.deepEqual(sleeps, [5000, 5000]);
  assert.deepEqual([...new Set(statuses)], ['requesting', 'queued', 'running']);
  assert.deepEqual(saved, [analysis]);
  assert.equal(appStore.getState().analysisRequests['0'], undefined);
  assert.equal(hasTranslations('0'), true);
});

test('poll failures, missing jobs and ten-minute timeout leave a failed request', async () => {
  for (const result of ['failed', 'missing', 'timeout', 'invalid', 'offline']) {
    let polls = 0;
    setAnalysisRuntime({
      fetch: async (_url, options) => {
        if (options?.method === 'POST')
          return Response.json({ fingerprint: getLyrics('0').fingerprint, status: 'queued' }, { status: 202 });
        polls++;
        if (result === 'missing') return new Response(null, { status: 404 });
        if (result === 'invalid') return Response.json({ bad: true });
        if (result === 'offline') throw new Error('offline');
        return Response.json(
          {
            status: result === 'failed' ? 'failed' : 'running',
            ...(result === 'failed' ? { error: 'worker rejected lyrics' } : {}),
          },
          { status: 202 },
        );
      },
      sleep: async () => {},
      save: async () => assert.fail('Failed requests must not save'),
    });
    await analyzeSong('0');
    const request = appStore.getState().analysisRequests['0']!;
    assert.equal(request.status, 'failed');
    assert.ok(request.error);
    assert.equal(polls, result === 'timeout' ? 120 : 1);
  }
});

test('immediate POST results are stored and concurrent requests share one job', async () => {
  const analysis = analysisFor('0');
  let calls = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      await gate;
      return Response.json(analysis);
    },
    save: async () => {},
  });
  const first = analyzeSong('0');
  const second = analyzeSong('0');
  assert.equal(first, second);
  release();
  await first;
  assert.equal(calls, 1);
  assert.equal(getLyrics('0').analysis?.title, analysis.title);
});

test('settings persist URL while the token stays in SecureStore only', async () => {
  const tokens: string[] = [];
  setAnalysisRuntime({
    saveToken: async (token) => {
      tokens.push(token);
    },
    loadToken: async () => 'boot-token',
    fetch: async () => new Response(null, { status: 404 }),
  });
  let persisted = '';
  await hydrateAppState({
    getItem: () => null,
    setItem: (_key, value) => {
      persisted = value;
    },
    removeItem() {},
  });
  await appStore.getState().setAnalysisToken(' secret ');
  appStore.getState().setAnalysisServerUrl(' https://override.test/ ');
  assert.deepEqual(tokens, ['secret']);
  assert.equal(JSON.parse(persisted).state.analysisServerUrl, 'https://override.test');
  assert.equal('analysisToken' in JSON.parse(persisted).state, false);
  assert.equal('analysisRequests' in JSON.parse(persisted).state, false);
  await loadAnalysisToken();
  assert.equal(appStore.getState().analysisToken, 'boot-token');
  assert.equal(canAnalyze(), true);
  appStore.setState({ analysisToken: '' });
  assert.equal(canAnalyze(), false);
});

test('cancellation waits for accepted persistence and prevents late publication', async () => {
  let entered!: () => void, release!: () => void;
  const saving = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  setAnalysisRuntime({
    fetch: async () => Response.json(analysisFor('0')),
    save: async () => {
      entered();
      await gate;
    },
  });
  const work = prioritizeAnalyses(['0']);
  await saving;
  let cancelled = false;
  const stop = cancelAnalyses().then(() => {
    cancelled = true;
  });
  await Promise.resolve();
  assert.equal(cancelled, false);
  release();
  await Promise.all([work, stop]);
  assert.deepEqual(libraryStore.getState().analyses, {});
});

test('disabled analyses make no requests, and the empty override uses the environment default', async () => {
  const original = process.env.EXPO_PUBLIC_KASHI_SERVER_URL;
  let calls = 0;
  setAnalysisRuntime({
    fetch: async () => {
      calls++;
      return new Response(null, { status: 404 });
    },
  });
  try {
    delete process.env.EXPO_PUBLIC_KASHI_SERVER_URL;
    appStore.setState({ analysisServerUrl: '' });
    assert.equal(canAnalyze(), false);
    await prioritizeAnalyses(['0']);
    await analyzeSong('0');
    assert.equal(calls, 0);
    process.env.EXPO_PUBLIC_KASHI_SERVER_URL = 'https://default.test';
    assert.equal(canAnalyze(), true);
    await prioritizeAnalyses(['0']);
    assert.equal(calls, 1);
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_KASHI_SERVER_URL;
    else process.env.EXPO_PUBLIC_KASHI_SERVER_URL = original;
  }
});

test('cancelling a pending request prevents both saving and later request state', async () => {
  const analysis = analysisFor('0');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  setAnalysisRuntime({
    fetch: async () => {
      await gate;
      return Response.json(analysis);
    },
    save: async () => assert.fail('A cancelled result must not save'),
  });
  const work = analyzeSong('0');
  const cancellation = cancelAnalyses();
  release();
  await Promise.all([work, cancellation]);
  assert.deepEqual(appStore.getState().analysisRequests, {});
  assert.deepEqual(libraryStore.getState().analyses, {});
});

test('re-analysis ignores the old published result while its forced job is pending', async () => {
  const old = analysisFor('0'),
    updated = { ...old, createdAt: '2026-10-08T00:01:00Z', title: 'A new reading' };
  libraryStore.getState().setAnalysis(old);
  let gets = 0;
  const saved: SongAnalysis[] = [];
  setAnalysisRuntime({
    fetch: async (_url, options) =>
      options?.method === 'POST'
        ? Response.json({ fingerprint: old.fingerprint, status: 'queued' }, { status: 202 })
        : Response.json(++gets === 1 ? old : updated),
    sleep: async () => {},
    save: async (analysis) => {
      saved.push(analysis);
    },
  });
  await analyzeSong('0', { force: true });
  assert.equal(gets, 2);
  assert.deepEqual(saved, [updated]);
  assert.equal(getLyrics('0').analysis?.title, updated.title);
});

test('a delayed public read cannot overwrite a completed admin analysis', async () => {
  const old = analysisFor('0'),
    updated = { ...old, createdAt: '2026-10-08T00:01:00Z', title: 'A new reading' };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saved: SongAnalysis[] = [];
  setAnalysisRuntime({
    fetch: async (_url, options) => {
      if (options?.method === 'POST') return Response.json(updated);
      await gate;
      return Response.json(old);
    },
    save: async (analysis) => {
      saved.push(analysis);
    },
  });
  const background = prioritizeAnalyses(['0']);
  await analyzeSong('0', { force: true });
  release();
  await background;
  assert.deepEqual(saved, [updated]);
  assert.equal(getLyrics('0').analysis?.title, updated.title);
});

test('failed forced re-analysis retains its intent through Retry', async () => {
  const old = analysisFor('0'),
    updated = { ...old, createdAt: '2026-10-08T00:01:00Z' };
  libraryStore.getState().setAnalysis(old);
  const forces: boolean[] = [];
  const requests: Record<string, boolean> = {};
  const unsubscribe = appStore.subscribe((state) => {
    const request = state.analysisRequests['0'];
    if (request) requests[request.status] = request.force;
  });
  let posts = 0,
    polls = 0;
  setAnalysisRuntime({
    fetch: async (_url, options) => {
      if (options?.method === 'POST') {
        forces.push(JSON.parse(String(options.body)).force);
        return ++posts === 1
          ? Response.json({ fingerprint: old.fingerprint, status: 'queued' }, { status: 202 })
          : Response.json(updated);
      }
      polls++;
      return Response.json({ status: 'failed', error: 'Analyzer unavailable' }, { status: 202 });
    },
    sleep: async () => {},
    save: async () => {},
  });
  try {
    await analyzeSong('0', { force: true });
    assert.equal(polls, 1);
    const failed = appStore.getState().analysisRequests['0']!;
    assert.deepEqual(failed, { status: 'failed', error: 'Analyzer unavailable', force: true });
    assert.equal(libraryStore.getState().analyses[old.fingerprint], old);
    await appStore.getState().analyzeSong('0', { force: failed.force });
    assert.deepEqual(forces, [true, true]);
    assert.deepEqual(requests, { requesting: true, queued: true, failed: true });
    assert.equal(appStore.getState().analysisRequests['0'], undefined);
    assert.equal(libraryStore.getState().analyses[old.fingerprint]?.createdAt, updated.createdAt);
  } finally {
    unsubscribe();
  }
});

test('logout drains a slow token save and prevents late token publication', async () => {
  let entered!: () => void,
    release!: () => void,
    persisted = 'old-token';
  const saving = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  setAnalysisRuntime({
    saveToken: async (token) => {
      if (token) {
        entered();
        await gate;
      }
      persisted = token;
    },
  });
  const work = appStore.getState().setAnalysisToken('new-token');
  await saving;
  let drained = false;
  const logout = cancelAnalyses().then(async () => {
    drained = true;
    await saveAnalysisToken('');
    await resetAppState();
  });
  await Promise.resolve();
  assert.equal(drained, false);
  appStore.setState({ analysisToken: '' });
  release();
  await work;
  assert.equal(appStore.getState().analysisToken, '');
  await logout;
  assert.equal(persisted, '');
  assert.equal(appStore.getState().analysisToken, '');
});
