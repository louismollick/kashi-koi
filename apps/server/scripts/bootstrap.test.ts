import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Analyzer } from '../src/analyzer/index.ts';
import { openDatabase } from '../src/db/index.ts';
import { main, startServer } from '../src/index.ts';
import { draft, input } from './test-utils.ts';

test('bootstrap recovers interrupted work, serves health, and closes HTTP and SQLite', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'kashi-bootstrap-test-'));
  const store = openDatabase(dataDir);
  store.enqueue(input);
  store.claimNext();
  let calls = 0;
  const analyzer: Analyzer = {
    model: 'stub-model',
    async analyze() {
      calls++;
      return draft;
    },
  };
  const instance = startServer({ store, analyzer, adminToken: 'test-token', port: 0 });
  t.after(async () => {
    await instance.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(store.getJob(input.fingerprint)?.status, 'done');
  assert.equal(store.getJob(input.fingerprint)?.attempts, 2);
  await instance.close();
  await instance.close();
  assert.equal(instance.server.listening, false);
  assert.throws(() => store.getJob(input.fingerprint), /not open/);
});

test('bootstrap checks environment before opening a database or analyzer', (t) => {
  const previousToken = process.env.KASHI_ADMIN_TOKEN;
  const previousPort = process.env.PORT;
  t.after(() => {
    if (previousToken === undefined) delete process.env.KASHI_ADMIN_TOKEN;
    else process.env.KASHI_ADMIN_TOKEN = previousToken;
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  });
  delete process.env.KASHI_ADMIN_TOKEN;
  assert.throws(() => main(), /KASHI_ADMIN_TOKEN/);
  process.env.KASHI_ADMIN_TOKEN = 'test-token';
  process.env.PORT = 'invalid';
  assert.throws(() => main(), /PORT/);
});
