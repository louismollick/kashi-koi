import { testDecoys } from './test-utils.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { type Analyzer, UsageLimitError } from '../src/analyzer/index.ts';
import { Worker } from '../src/worker.ts';
import { draft, input, testStore } from './test-utils.ts';

const model = 'stub-model';
const firstSentence = draft.sentences[0];
assert.ok(firstSentence);
const epoch = Date.parse('2026-10-08T12:00:00.000Z');

test('validates and stamps model output, then clears source lines', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  const analyzer: Analyzer = {
    model,
    async analyze(request) {
      assert.equal(request.title, input.title);
      assert.equal(request.artist, input.artist);
      assert.deepEqual(request.lines, input.lines);
      assert.equal(request.feedback, undefined);
      return draft;
    },
  };
  const worker = new Worker(store, analyzer, () => epoch);
  assert.equal(await worker.runNext(), true);
  assert.equal(await worker.runNext(), false);
  assert.deepEqual(store.getAnalysis(input.fingerprint), {
    ...draft,
    schemaVersion: 2,
    fingerprint: input.fingerprint,
    model,
    createdAt: new Date(epoch).toISOString(),
  });
  assert.equal(store.getJob(input.fingerprint)?.status, 'done');
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
  assert.deepEqual(store.getAnalysisSource(input.fingerprint)?.lines, input.lines);
});

test('invalid analysis retries exactly once with validation feedback', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    async analyze(request) {
      calls++;
      if (calls === 1)
        return {
          ...draft,
          sentences: [{ start: 1, end: 1, translation: 'Incomplete', decoys: testDecoys('Incomplete') }],
        };
      assert.ok(request.feedback?.some((message) => message.includes('expected 0')));
      return draft;
    },
  };
  await new Worker(store, analyzer).runNext();
  assert.equal(calls, 2);
  assert.equal(store.getJob(input.fingerprint)?.attempts, 1);
  assert.equal(store.getJob(input.fingerprint)?.status, 'done');
});

test('two invalid outputs fail, clear lyrics, and persist no lyric-bearing errors', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    async analyze() {
      calls++;
      return { ...draft, title: input.lines[0], lines: [] };
    },
  };
  const worker = new Worker(store, analyzer);
  await worker.runNext();
  assert.equal(calls, 2);
  assert.equal(await worker.runNext(), false);
  assert.equal(store.getAnalysis(input.fingerprint), undefined);
  assert.equal(store.getJob(input.fingerprint)?.status, 'failed');
  assert.equal(store.getJob(input.fingerprint)?.error, 'Analysis validation failed');
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
});

test('process failures, including timeout errors, fail after three attempts', async (t) => {
  const logged: string[] = [];
  t.mock.method(console, 'error', (message: string) => logged.push(message));
  const { store } = testStore(t);
  store.enqueue(input);
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    async analyze() {
      calls++;
      throw new Error(`Timeout ${calls} while processing ${input.lines.join('\n')}`);
    },
  };
  const worker = new Worker(store, analyzer);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await worker.runNext();
    const job = store.getJob(input.fingerprint);
    assert.equal(job?.attempts, attempt);
    assert.equal(job?.status, attempt < 3 ? 'queued' : 'failed');
    assert.equal(job?.error?.includes(input.lines[0] ?? ''), false);
    assert.equal(
      job?.error,
      `${attempt === 3 ? 'Analyzer failed after 3 attempts: ' : ''}Timeout ${attempt} while processing …\n…`,
    );
  }
  assert.equal(await worker.runNext(), false);
  assert.equal(calls, 3);
  assert.deepEqual(
    logged,
    [1, 2, 3].map((attempt) => `Timeout ${attempt} while processing …\n…`),
  );
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
});

test('failure logs also redact source lines without Japanese script', async (t) => {
  const logged: string[] = [];
  t.mock.method(console, 'error', (message: string) => logged.push(message));
  const { store } = testStore(t);
  const source = 'I count small clouds beside my window';
  store.enqueue({ ...input, lines: [...input.lines, source] });
  await new Worker(store, {
    model,
    async analyze() {
      throw new Error(`Failed on ${source}`);
    },
  }).runNext();
  assert.deepEqual(logged, ['Failed on …']);
  assert.equal(store.getJob(input.fingerprint)?.error, 'Failed on …');
});

test('the last sanitized Codex failure is included in the final job error', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  const analyzer: Analyzer = {
    model,
    async analyze() {
      throw new Error('Codex failed (exit 1): workspace routing discovery failed');
    },
  };
  const worker = new Worker(store, analyzer);
  for (let attempt = 0; attempt < 3; attempt++) await worker.runNext();
  assert.equal(
    store.getJob(input.fingerprint)?.error,
    'Analyzer failed after 3 attempts: Codex failed (exit 1): workspace routing discovery failed',
  );
});

test('unknown thrown values use a fixed message and long error messages are bounded', async (t) => {
  for (const error of [input.lines[0], new Error('x'.repeat(1000))]) {
    const { store } = testStore(t);
    store.enqueue(input);
    const analyzer: Analyzer = {
      model,
      async analyze() {
        throw error;
      },
    };
    const worker = new Worker(store, analyzer);
    for (let attempt = 0; attempt < 3; attempt++) await worker.runNext();
    assert.equal(
      store.getJob(input.fingerprint)?.error,
      `Analyzer failed after 3 attempts: ${error instanceof Error ? 'x'.repeat(400) : 'Unknown analyzer error'}`,
    );
  }
});

test('Japanese script in otherwise valid output gets validation feedback and cannot be stored', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    async analyze(request) {
      calls++;
      if (calls === 2) assert.ok(request.feedback?.some((message) => message.includes('Romanize')));
      return { ...draft, summary: 'The word 朝 means morning.' };
    },
  };
  await new Worker(store, analyzer).runNext();
  assert.equal(calls, 2);
  assert.equal(store.getAnalysis(input.fingerprint), undefined);
  assert.equal(store.getJob(input.fingerprint)?.status, 'failed');
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
});

test('a third interrupted attempt fails after boot recovery without a fourth analyzer call', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    store.claimNext();
    store.recoverRunning();
  }
  const analyzer: Analyzer = {
    model,
    async analyze() {
      assert.fail('Recovered job exhausted its crash attempts');
    },
  };
  await new Worker(store, analyzer).runNext();
  assert.equal(store.getJob(input.fingerprint)?.status, 'failed');
  assert.equal(store.getJob(input.fingerprint)?.attempts, 3);
  assert.equal(store.getJob(input.fingerprint)?.error, 'Analyzer failed after 3 attempts');
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
});

test('boot recovery retains the last failure when a later attempt exhausts the job', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  store.claimNext();
  store.retry(input.fingerprint, 'Codex timed out after 300s');
  for (let attempt = 0; attempt < 2; attempt++) {
    store.claimNext();
    store.recoverRunning();
  }
  const analyzer: Analyzer = {
    model,
    async analyze() {
      assert.fail('Recovered job exhausted its crash attempts');
    },
  };
  await new Worker(store, analyzer).runNext();
  assert.equal(store.getJob(input.fingerprint)?.error, 'Analyzer failed after 3 attempts: Codex timed out after 300s');
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
});

test('usage limits pause all jobs for 15, 30, then 60 minutes without spending attempts', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  store.enqueue({ ...input, fingerprint: 'second' });
  let now = epoch;
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    async analyze() {
      calls++;
      throw new UsageLimitError('Usage limit');
    },
  };
  const worker = new Worker(store, analyzer, () => now);
  for (const minutes of [15, 30, 60, 60]) {
    await worker.runNext();
    assert.equal(store.getJob(input.fingerprint)?.attempts, 0);
    assert.equal(store.getJob('second')?.attempts, 0);
    assert.equal(store.getJob(input.fingerprint)?.status, 'queued');
    assert.equal(store.getJob('second')?.status, 'queued');
    now += minutes * 60 * 1000 - 1;
    assert.equal(await worker.runNext(), false);
    now++;
  }
  assert.equal(calls, 4);
});

test('a successful analysis resets the usage delay to 15 minutes', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  let now = epoch;
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    async analyze() {
      calls++;
      if (calls === 3) return draft;
      throw new UsageLimitError('Usage limit');
    },
  };
  const worker = new Worker(store, analyzer, () => now);
  await worker.runNext();
  now += 15 * 60 * 1000;
  await worker.runNext();
  now += 30 * 60 * 1000;
  await worker.runNext();
  store.enqueue(input, true);
  await worker.runNext();
  now += 15 * 60 * 1000;
  assert.equal(await worker.runNext(), true);
  assert.equal(calls, 5);
});

test('the worker never runs two analyses concurrently and finishes its active job before stopping', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  store.enqueue({ ...input, fingerprint: 'second' });
  const abort = new AbortController();
  let finish: (value: unknown) => void = () => assert.fail('Analysis has not started');
  let calls = 0;
  const analyzer: Analyzer = {
    model,
    analyze() {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const worker = new Worker(store, analyzer);
  const running = worker.run(abort.signal);
  await assert.rejects(worker.runNext(), /already processing/);
  abort.abort();
  finish(draft);
  await running;
  assert.equal(calls, 1);
  assert.equal(store.getJob(input.fingerprint)?.status, 'done');
  assert.equal(store.getJob('second')?.status, 'queued');
});

test('the final attempt drops only invalid decoys and accepts the translations', async (t) => {
  for (const decoys of [
    firstSentence.decoys.map((decoy) => ({ ...decoy, from: "can't go back" })),
    [],
    [{ from: '', to: '', reason: '' }],
    [
      { from: 'Opening', to: '閉める', reason: '開ける means open.' },
      { from: 'Opening', to: 'Shutting', reason: 'Wrong verb' },
    ],
  ]) {
    const { store } = testStore(t);
    store.enqueue(input);
    let calls = 0;
    const valid = {
      start: 1,
      end: 1,
      translation: 'I call your name into the wind',
      decoys: testDecoys('I call your name into the wind'),
    };
    await new Worker(store, {
      model,
      async analyze(request) {
        if (++calls === 2) assert.ok(request.feedback?.length);
        return { ...draft, sentences: [{ ...firstSentence, end: 0, decoys }, valid] };
      },
    }).runNext();
    assert.equal(calls, 2);
    assert.equal(store.getJob(input.fingerprint)?.status, 'done');
    assert.deepEqual(store.getAnalysis(input.fingerprint)?.sentences, [
      { ...firstSentence, end: 0, decoys: [] },
      valid,
    ]);
  }
});

test('dropping invalid decoys does not hide structural errors on the final attempt', async (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  await new Worker(store, {
    model,
    async analyze() {
      return { ...draft, lines: [], sentences: draft.sentences.map((sentence) => ({ ...sentence, decoys: [] })) };
    },
  }).runNext();
  assert.equal(store.getJob(input.fingerprint)?.status, 'failed');
  assert.equal(store.getAnalysis(input.fingerprint), undefined);
});
