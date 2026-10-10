import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint } from '@kashi-koi/shared';
import { createApi, MAX_BODY_BYTES } from '../src/api.ts';
import { analysis, input, key, lines, testStore } from './test-utils.ts';

const token = 'secret-owner-token';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const body = { title: input.title, artist: input.artist, lines };

test('health and missing public reads require no bearer token', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  assert.deepEqual(await (await app.request('/health')).json(), { status: 'ok' });
  assert.equal((await app.request('/v1/analyses/missing')).status, 404);
  assert.throws(() => createApi(store, ' '), /KASHI_ADMIN_TOKEN/);
});

test('creation requires an exact bearer credential', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  for (const authorization of ['', 'Bearer wrong', 'Basic secret-owner-token', `Bearer ${token}x`, `bearer ${token}`]) {
    const response = await app.request('/v1/analyses', {
      method: 'POST',
      headers: { ...headers, Authorization: authorization },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
  assert.equal(store.getJob(key), undefined);
});

test('POST queues, dedupes, and public GET exposes queued, running, failed and ready states', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  const post = () => app.request('/v1/analyses', { method: 'POST', headers, body: JSON.stringify(body) });
  const queued = await post();
  assert.equal(queued.status, 202);
  assert.deepEqual(await queued.json(), { fingerprint: key, status: 'queued' });
  assert.equal((await post()).status, 202);
  assert.deepEqual(await (await app.request(`/v1/analyses/${key}`)).json(), { status: 'queued' });
  store.claimNext();
  assert.deepEqual(await (await app.request(`/v1/analyses/${key}`)).json(), { status: 'running' });
  store.fail(key, 'Analyzer failed after 3 attempts');
  const failed = await app.request(`/v1/analyses/${key}`);
  assert.equal(failed.status, 202);
  assert.deepEqual(await failed.json(), { status: 'failed', error: 'Analyzer failed after 3 attempts' });
  const restarted = await post();
  assert.equal(restarted.status, 202);
  assert.equal(store.getJob(key)?.status, 'queued');
  assert.equal(store.getJob(key)?.attempts, 0);
  assert.deepEqual(store.getJob(key)?.lines, lines);
  store.claimNext();
  store.complete(analysis, input.lines);
  const ready = await app.request(`/v1/analyses/${key}`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), analysis);
  const existing = await post();
  assert.equal(existing.status, 200);
  assert.deepEqual(await existing.json(), analysis);
});

test('force queues a replacement and GET returns pending until it completes', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  store.enqueue(input);
  store.claimNext();
  store.complete(analysis, input.lines);
  const forced = await app.request('/v1/analyses', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, force: true }),
  });
  assert.equal(forced.status, 202);
  assert.equal((await app.request(`/v1/analyses/${key}`)).status, 202);
  store.claimNext();
  assert.equal((await app.request(`/v1/analyses/${key}`)).status, 202);
  store.complete({ ...analysis, title: 'New title' }, input.lines);
  assert.equal((await app.request(`/v1/analyses/${key}`)).status, 200);
  assert.equal(store.getAnalysis(key)?.title, 'New title');
});

test('GET reports a failed forced replacement while preserving the existing analysis', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  store.enqueue(input);
  store.claimNext();
  store.complete({ ...analysis, createdAt: '2000-01-01T00:00:00.000Z' }, input.lines);
  await app.request('/v1/analyses', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, force: true }),
  });
  store.claimNext();
  store.fail(key, 'Replacement failed');
  const failed = await app.request(`/v1/analyses/${key}`);
  assert.equal(failed.status, 202);
  assert.deepEqual(await failed.json(), { status: 'failed', error: 'Replacement failed' });
  assert.equal(store.getAnalysis(key)?.title, analysis.title);
});

test('GET serves an analysis newer than a failed job', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  store.enqueue(input);
  store.claimNext();
  store.complete({ ...analysis, createdAt: '2100-01-01T00:00:00.000Z' }, input.lines);
  store.enqueue(input, true);
  store.claimNext();
  store.fail(key, 'Older failure');
  const ready = await app.request(`/v1/analyses/${key}`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).createdAt, '2100-01-01T00:00:00.000Z');
});

test('rejects malformed JSON and oversized actual bodies with JSON responses', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  for (const [text, status] of [
    ['{', 400],
    ['x'.repeat(MAX_BODY_BYTES + 1), 413],
  ] as const) {
    const response = await app.request('/v1/analyses', {
      method: 'POST',
      headers: { ...headers, 'Content-Length': '1' },
      body: text,
    });
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  }
  const wrongType = await app.request('/v1/analyses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: '{}',
  });
  assert.equal(wrongType.status, 415);
});

test('validates request types, Japanese content, and all title/artist/line limits', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  const invalid: unknown[] = [
    null,
    {},
    { ...body, title: '' },
    { ...body, title: 'a'.repeat(301) },
    { ...body, artist: 'a'.repeat(301) },
    { ...body, artist: 1 },
    { ...body, lines: [] },
    { ...body, lines: ['English only'] },
    { ...body, lines: Array(201).fill('朝') },
    { ...body, lines: ['朝'.repeat(301)] },
    { ...body, lines: ['朝', '  '] },
    { ...body, force: 'true' },
    { ...body, extra: true },
  ];
  for (const value of invalid) {
    const response = await app.request('/v1/analyses', { method: 'POST', headers, body: JSON.stringify(value) });
    assert.equal(response.status, 400, JSON.stringify(value));
  }
  const max = { title: 'a'.repeat(300), artist: 'b'.repeat(300), lines: Array(200).fill('朝'.repeat(300)) };
  const response = await app.request('/v1/analyses', { method: 'POST', headers, body: JSON.stringify(max) });
  assert.equal(response.status, 202);
});

test('fingerprints the exact line input without changing whitespace', async (t) => {
  const { store } = testStore(t);
  const app = createApi(store, token);
  const spaced = [' 朝の窓を開ける '];
  const response = await app.request('/v1/analyses', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: input.title, lines: spaced }),
  });
  assert.deepEqual(await response.json(), { fingerprint: fingerprint(spaced), status: 'queued' });
});
