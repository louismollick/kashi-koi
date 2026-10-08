import assert from 'node:assert/strict';
import test from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { fetchAnalysis, requestAnalysis } from '../src/analysis/client';

// Original lyrics; the repeated line must remain part of the fingerprint.
const lines = ['窓辺で朝を待つ', 'まだ名のない風を呼ぶ', '窓辺で朝を待つ'];
const fp = fingerprint(lines);
const input = { title: '窓辺の風', artist: '試作の歌い手', lines };
const analysis: SongAnalysis = {
  schemaVersion: 1,
  fingerprint: fp,
  model: 'test-model',
  createdAt: '2026-10-08T00:00:00Z',
  title: 'Wind at the window',
  summary: 'The speaker waits for morning and calls to an unnamed wind.',
  speaker: 'Someone waiting by a window',
  addressee: 'The wind',
  lines: ['I wait for morning by the window', 'And call to a wind without a name', 'I wait by the window again'],
  sentences: [
    { start: 0, end: 1, translation: 'I wait for morning by the window, calling to an unnamed wind.' },
    { start: 2, end: 2, translation: 'I wait by the window again.' },
  ],
  notes: [{ line: 1, text: 'The speaker continues the thought from the first line.' }],
};
const reply =
  (value: unknown, status = 200): typeof fetch =>
  async () =>
    Response.json(value, { status });

test('GET returns validated analysis and preserves the base path with an encoded fingerprint', async () => {
  const result = await fetchAnalysis(' https://analysis.test/api/// ', fp, async (url, init) => {
    assert.equal(url, `https://analysis.test/api/v1/analyses/${encodeURIComponent(fp)}`);
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.headers, undefined);
    return Response.json(analysis);
  });
  assert.deepEqual(result, { status: 200, analysis });
});

test('GET accepts queued, running and failed jobs, and a missing analysis without a JSON body', async () => {
  for (const job of [{ status: 'queued' }, { status: 'running' }, { status: 'failed', error: 'Worker failed' }]) {
    assert.deepEqual(await fetchAnalysis('https://analysis.test', fp, reply(job, 202)), { status: 202, job });
  }
  assert.deepEqual(await fetchAnalysis('https://analysis.test', fp, async () => new Response(null, { status: 404 })), {
    status: 404,
  });
});

test('POST sends raw occurrence lyrics, owner token and force, then returns the validated existing analysis', async () => {
  const body = { ...input, force: true };
  const result = await requestAnalysis('http://localhost:3000/api/', 'owner-token', body, async (url, init) => {
    assert.equal(url, 'http://localhost:3000/api/v1/analyses');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init.headers, { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' });
    assert.equal(init.body, JSON.stringify(body));
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(analysis);
  });
  assert.deepEqual(result, { status: 200, analysis });
});

test('POST returns validated pending jobs with the computed fingerprint and accepts omitted artist and force', async () => {
  for (const job of [{ status: 'queued' }, { status: 'running' }, { status: 'failed', error: 'Worker failed' }]) {
    assert.deepEqual(
      await requestAnalysis('https://analysis.test', 'token', { title: input.title, lines }, async (_url, init) => {
        assert.equal(init?.body, JSON.stringify({ title: input.title, lines }));
        return Response.json({ fingerprint: fp, ...job }, { status: 202 });
      }),
      { status: 202, fingerprint: fp, job },
    );
  }
});

test('GET and POST reject schema errors, wrong fingerprints and invalid sentence or note ranges', async () => {
  const invalid: unknown[] = [
    null,
    {},
    { ...analysis, schemaVersion: 2 },
    { ...analysis, model: ' ' },
    { ...analysis, fingerprint: fingerprint(['別の窓を開ける']) },
    { ...analysis, extra: 'unrecognized' },
    { ...analysis, lines: [' ', ...analysis.lines.slice(1)] },
    { ...analysis, sentences: [] },
    { ...analysis, sentences: [{ start: 1, end: 2, translation: 'Gap' }] },
    { ...analysis, sentences: [analysis.sentences[0], { start: 1, end: 2, translation: 'Overlap' }] },
    { ...analysis, sentences: [...analysis.sentences].reverse() },
    { ...analysis, sentences: [{ start: 0, end: 3, translation: 'Out of range' }] },
    { ...analysis, sentences: [{ start: 0, end: -1, translation: 'Reversed' }] },
    { ...analysis, sentences: [{ start: 0.5, end: 2, translation: 'Fractional' }] },
    { ...analysis, notes: [{ line: 3, text: 'Out of range' }] },
    { ...analysis, notes: [{ line: -1, text: 'Negative' }] },
    { ...analysis, notes: [{ line: 0, text: '\n ' }] },
  ];
  for (const value of invalid) {
    await assert.rejects(fetchAnalysis('https://analysis.test', fp, reply(value)));
    await assert.rejects(requestAnalysis('https://analysis.test', 'token', input, reply(value)));
  }
});

test('POST checks the submitted occurrence count as well as its fingerprint', async () => {
  const longer = { ...input, lines: [...lines, '夜には小さな灯を置く'] };
  const shorterAnalysis = { ...analysis, fingerprint: fingerprint(longer.lines) };
  await assert.rejects(
    requestAnalysis('https://analysis.test', 'token', longer, reply(shorterAnalysis)),
    /Expected 4 line translations/,
  );
});

test('GET and POST reject malformed pending responses', async () => {
  for (const value of [null, [], 'queued', {}, { status: 'done' }, { status: 'running', error: 42 }]) {
    await assert.rejects(fetchAnalysis('https://analysis.test', fp, reply(value, 202)), /Invalid song analysis job/);
    const postValue = typeof value === 'object' && value !== null ? { ...value, fingerprint: fp } : value;
    await assert.rejects(
      requestAnalysis('https://analysis.test', 'token', input, reply(postValue, 202)),
      /Invalid song analysis job/,
    );
  }
});

test('POST rejects missing or incorrect pending fingerprints', async () => {
  for (const value of [
    { status: 'queued' },
    { status: 'queued', fingerprint: 42 },
    { status: 'queued', fingerprint: fingerprint([lines[1]!, lines[0]!, lines[2]!]) },
    { status: 'queued', fingerprint: fingerprint(lines.slice(0, 2)) },
  ]) {
    await assert.rejects(
      requestAnalysis('https://analysis.test', 'token', input, reply(value, 202)),
      /fingerprint does not match/,
    );
  }
});

test('unexpected HTTP responses and invalid JSON reject', async () => {
  for (const status of [201, 204, 400, 401, 403, 429, 500, 503]) {
    const fetcher: typeof fetch = async () => new Response(null, { status });
    await assert.rejects(fetchAnalysis('https://analysis.test', fp, fetcher), new RegExp(`HTTP ${status}`));
    await assert.rejects(
      requestAnalysis('https://analysis.test', 'token', input, fetcher),
      new RegExp(`HTTP ${status}`),
    );
  }
  await assert.rejects(requestAnalysis('https://analysis.test', 'token', input, reply({}, 404)), /HTTP 404/);
  for (const status of [200, 202]) {
    const fetcher: typeof fetch = async () => new Response('invalid JSON', { status });
    await assert.rejects(fetchAnalysis('https://analysis.test', fp, fetcher), SyntaxError);
    await assert.rejects(requestAnalysis('https://analysis.test', 'token', input, fetcher), SyntaxError);
  }
});

test('network failures propagate for both operations', async () => {
  const failure = new Error('offline');
  const fetcher: typeof fetch = async () => {
    throw failure;
  };
  await assert.rejects(fetchAnalysis('https://analysis.test', fp, fetcher), (error) => error === failure);
  await assert.rejects(requestAnalysis('https://analysis.test', 'token', input, fetcher), (error) => error === failure);
});

test('default fetch calls use a 30 second timeout and propagate aborts', async (t) => {
  const controller = new AbortController();
  const timeout = new DOMException('Timed out', 'TimeoutError');
  controller.abort(timeout);
  let calls = 0;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    assert.equal(ms, 30_000);
    return controller.signal;
  });
  t.mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls++;
    assert.equal(init?.signal, controller.signal);
    init?.signal?.throwIfAborted();
    return Response.json(analysis);
  });
  await assert.rejects(fetchAnalysis('https://analysis.test', fp), (error) => error === timeout);
  await assert.rejects(requestAnalysis('https://analysis.test', 'token', input), (error) => error === timeout);
  assert.equal(calls, 2);
});
