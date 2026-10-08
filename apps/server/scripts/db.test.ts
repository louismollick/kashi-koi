import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../src/db/index.ts';
import { analysis, input, testStore } from './test-utils.ts';

// This exercises the migration and store using temporary SQLite files, not a mock database.
test('migrations apply on open and analyses survive reopening', (t) => {
  const { store, dataDir } = testStore(t);
  store.enqueue(input);
  store.claimNext();
  store.complete(analysis);
  const reopened = openDatabase(dataDir);
  try {
    assert.deepEqual(reopened.getAnalysis(input.fingerprint), analysis);
    assert.deepEqual(reopened.getJob(input.fingerprint)?.lines, []);
    assert.equal(reopened.getJob(input.fingerprint)?.status, 'done');
  } finally {
    reopened.close();
  }
});

test('dedupes active jobs, promotes backfill, and restarts failed jobs', (t) => {
  const { store } = testStore(t);
  const low = store.enqueue({ ...input, priority: 0 });
  assert.equal(low.priority, 0);
  assert.equal(store.enqueue(input).priority, 1);
  assert.equal(store.claimNext()?.attempts, 1);
  assert.equal(store.enqueue(input, true).status, 'running');
  store.fail(input.fingerprint, 'Analysis validation failed');
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, []);
  const forced = store.enqueue(input);
  assert.equal(forced.status, 'queued');
  assert.equal(forced.attempts, 0);
  assert.equal(forced.error, null);
  assert.deepEqual(forced.lines, input.lines);
});

test('queue takes highest priority first, then oldest at every priority', (t) => {
  const { store } = testStore(t);
  for (const [fingerprint, priority] of [
    ['low-old', 0],
    ['high-old', 1],
    ['high-new', 1],
    ['low-new', 0],
  ] as const)
    store.enqueue({ ...input, fingerprint, priority });
  assert.deepEqual(
    Array.from({ length: 4 }, () => store.claimNext()?.fingerprint),
    ['high-old', 'high-new', 'low-old', 'low-new'],
  );
  assert.equal(store.claimNext(), undefined);
});

test('recovery retains crash attempts and usage limits undo the current attempt', (t) => {
  const { store } = testStore(t);
  store.enqueue(input);
  store.claimNext();
  store.recoverRunning();
  assert.equal(store.getJob(input.fingerprint)?.status, 'queued');
  assert.equal(store.claimNext()?.attempts, 2);
  store.retry(input.fingerprint, 'Usage limit reached', true);
  assert.equal(store.getJob(input.fingerprint)?.attempts, 1);
  assert.deepEqual(store.getJob(input.fingerprint)?.lines, input.lines);
});
