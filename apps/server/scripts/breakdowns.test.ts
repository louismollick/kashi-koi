import assert from 'node:assert/strict';
import test from 'node:test';
import { type BreakdownAnalyzer, type BreakdownInput, UsageLimitError } from '../src/analyzer/index.ts';
import { createApi } from '../src/api.ts';
import { analysis, input, key, lines, testStore } from './test-utils.ts';

const token = 'owner';
const path = (fingerprint = key, start = 0) => `/v1/analyses/${encodeURIComponent(fingerprint)}/breakdowns/${start}`;
const post = { method: 'POST', headers: { Authorization: `Bearer ${token}` } };
const outputFor = (input: BreakdownInput) => ({
  chunks: [
    {
      text: input.lines.slice(input.start, input.end + 1).join(''),
      steps: [{ japanese: '開ける', reading: 'あける', english: 'to open' }],
      note: '',
    },
  ],
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('breakdown POST validates once more with feedback, caches, and GET is public with no-store', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  store.complete(analysis, lines);
  let calls = 0;
  const analyzer: BreakdownAnalyzer = {
    model: 'breakdown-test',
    async breakdown(request) {
      assert.equal(request.title, input.title);
      assert.equal(request.artist, input.artist);
      assert.deepEqual(request.lines, lines);
      assert.deepEqual(request.translations, analysis.lines);
      assert.equal(request.translation, analysis.sentences[0]?.translation);
      if (++calls === 1) return { chunks: [] };
      assert.ok(request.feedback?.some((error) => error.includes('at least one chunk')));
      return outputFor(request);
    },
  };
  const app = createApi(store, token, analyzer);
  const missing = await app.request(path());
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  const response = await app.request(path(), post);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const breakdown = store.getBreakdown(key, 0);
  assert.ok(breakdown);
  assert.equal(breakdown.model, analyzer.model);
  assert.equal(breakdown.start, 0);
  assert.equal(breakdown.fingerprint, key);
  assert.ok(!Number.isNaN(Date.parse(breakdown.createdAt)));
  assert.deepEqual(await response.json(), breakdown);
  assert.deepEqual(await (await app.request(path())).json(), breakdown);
  assert.equal((await app.request(path(), post)).status, 200);
  assert.equal(calls, 2);
  store.complete({ ...analysis, title: 'A fresh reading' }, lines);
  assert.equal(store.getBreakdown(key, 0), undefined);
  assert.equal((await app.request(path())).status, 404);
});

test('breakdown POST requires the exact bearer token and a real sentence start', async (t) => {
  const { store } = testStore(t);
  store.complete(analysis, lines);
  const app = createApi(store, token, {
    model: 'test',
    async breakdown() {
      assert.fail('Must not run');
    },
  });
  for (const authorization of ['', 'Bearer bad', 'bearer owner', 'Basic owner'])
    assert.equal(
      (await app.request(path(), { method: 'POST', headers: { Authorization: authorization } })).status,
      401,
    );
  for (const url of [
    path('missing'),
    path(key, 1),
    path(key, -1),
    path(key, 0.5),
    `${path()}/bad`,
    path(key, 9007199254740992),
  ])
    assert.equal((await app.request(url, post)).status, 404);
});

test('breakdown failures return 429 or 502, stay uncached and never expose source lyrics', async (t) => {
  const logged: string[] = [];
  t.mock.method(console, 'error', (message: string) => logged.push(message));
  for (const error of [
    new UsageLimitError('quota'),
    new Error(`Refused ${lines[0]}`),
    new Error('Refused an English lyric'),
    'unknown',
  ]) {
    const { store } = testStore(t);
    store.complete(analysis, [...lines, 'an English lyric']);
    const app = createApi(store, token, {
      model: 'test',
      async breakdown() {
        throw error;
      },
    });
    const response = await app.request(path(), post);
    assert.equal(response.status, error instanceof UsageLimitError ? 429 : 502);
    assert.doesNotMatch(await response.text(), /朝|English lyric/);
    assert.equal(store.getBreakdown(key, 0), undefined);
  }
  const firstLine = lines[0];
  assert.ok(firstLine);
  assert.ok(logged.every((message) => !message.includes(firstLine) && !message.includes('an English lyric')));
});

test('two invalid breakdowns fail with a safe error and release the generation slot', async (t) => {
  const { store } = testStore(t);
  store.complete(analysis, lines);
  let calls = 0;
  const app = createApi(store, token, {
    model: 'test',
    async breakdown(request) {
      calls++;
      return calls <= 2 ? { chunks: [] } : outputFor(request);
    },
  });
  assert.equal((await app.request(path(), post)).status, 502);
  assert.equal(calls, 2);
  assert.equal(store.getBreakdown(key, 0), undefined);
  assert.equal((await app.request(path(), post)).status, 200);
});

test('same-key POSTs share a generation and only two different keys run concurrently', async (t) => {
  const { store } = testStore(t);
  for (const fp of ['one', 'two', 'three']) store.complete({ ...analysis, fingerprint: fp }, lines);
  const gates = new Map<string, ReturnType<typeof deferred>>();
  const started = deferred();
  let active = 0,
    peak = 0,
    calls = 0;
  const app = createApi(store, token, {
    model: 'test',
    async breakdown(request) {
      const gate = deferred();
      gates.set(String(++calls), gate);
      peak = Math.max(peak, ++active);
      if (calls === 2) started.resolve();
      await gate.promise;
      active--;
      return outputFor(request);
    },
  });
  const requests = ['one', 'one', 'two', 'three'].map((fp) => app.request(path(fp), post));
  await started.promise;
  assert.equal(calls, 2);
  const release = (id: string) => {
    const gate = gates.get(id);
    assert.ok(gate);
    gate.resolve();
  };
  release('1');
  const [first, duplicate] = requests;
  assert.ok(first && duplicate);
  assert.equal((await first).status, 200);
  assert.equal((await duplicate).status, 200);
  // The queued third key has acquired the released slot.
  assert.equal(calls, 3);
  release('2');
  release('3');
  assert.deepEqual(
    (await Promise.all(requests)).map((response) => response.status),
    [200, 200, 200, 200],
  );
  assert.equal(peak, 2);
});

test('an analysis replaced during generation cannot acquire an obsolete cached breakdown', async (t) => {
  const { store } = testStore(t);
  store.complete(analysis, lines);
  const gate = deferred(),
    started = deferred();
  const app = createApi(store, token, {
    model: 'test',
    async breakdown(request) {
      started.resolve();
      await gate.promise;
      return outputFor(request);
    },
  });
  const work = app.request(path(), post);
  await started.promise;
  store.complete({ ...analysis, title: 'Updated reading' }, lines);
  gate.resolve();
  assert.equal((await work).status, 502);
  assert.equal(store.getBreakdown(key, 0), undefined);
});

test('the breakdown queue allows two waiters, rejects overflow with 503 and still shares duplicate keys', async (t) => {
  const { store } = testStore(t);
  for (const fp of ['one', 'two', 'three', 'four', 'five']) store.complete({ ...analysis, fingerprint: fp }, lines);
  const gate = deferred(),
    started = deferred();
  let calls = 0;
  const app = createApi(store, token, {
    model: 'test',
    async breakdown(request) {
      if (++calls === 2) started.resolve();
      await gate.promise;
      return outputFor(request);
    },
  });
  const running = ['one', 'two'].map((fp) => app.request(path(fp), post));
  await started.promise;
  const queued = ['three', 'four'].map((fp) => app.request(path(fp), post));
  const duplicate = app.request(path('three'), post);
  const overflow = await app.request(path('five'), post);
  assert.equal(overflow.status, 503);
  assert.deepEqual(await overflow.json(), { error: 'Server busy' });
  assert.equal(calls, 2);
  gate.resolve();
  assert.deepEqual(
    (await Promise.all([...running, ...queued, duplicate])).map((response) => response.status),
    [200, 200, 200, 200, 200],
  );
  assert.equal(calls, 4);
  assert.equal((await app.request(path('five'), post)).status, 200);
  assert.equal(calls, 5);
});
