import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { fakeLibraryDb } from './fixtures';
import { setDownloadRuntime } from '../src/downloads/queue';
import { setLibraryDb } from '../src/navidrome/libraryDb';
import { login, loadSession, logout, sessionStore } from '../src/navidrome/session';
import { setSecrets } from '../src/navidrome/secrets';

const values = new Map<string, string>();
const install = () =>
  setSecrets({
    storage: {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
      },
      delete: async (key) => {
        values.delete(key);
      },
    },
    randomBytes: (length) => Uint8Array.from(randomBytes(length)),
  });

afterEach(() => {
  setSecrets(undefined);
  setDownloadRuntime();
  setLibraryDb(undefined);
  values.clear();
  sessionStore.setState({ session: null, ready: false, error: null });
});

test('login hashes password plus a random salt with md5, stores the session and loadSession restores it', async (t) => {
  install();
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      'subsonic-response': { status: 'ok', openSubsonicExtensions: [{ name: 'songLyrics', versions: [1] }] },
    }),
  );
  await login('https://music.test', ' user ', 'hunter2');
  const session = sessionStore.getState().session!;
  assert.match(session.salt, /^[0-9a-f]{32}$/);
  assert.equal(session.token, createHash('md5').update(`hunter2${session.salt}`).digest('hex'));
  assert.equal(session.username, 'user');
  assert.equal(JSON.parse(values.get('navidrome-session')!).token, session.token);
  sessionStore.setState({ session: null, ready: false });
  await loadSession();
  assert.deepEqual(sessionStore.getState().session, session);
  assert.equal(sessionStore.getState().ready, true);
});

test('a server without songLyrics is rejected and nothing is stored', async (t) => {
  install();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ 'subsonic-response': { status: 'ok' } }));
  await assert.rejects(login('https://music.test', 'user', 'pw'), /songLyrics/);
  assert.equal(values.size, 0);
  assert.equal(sessionStore.getState().session, null);
});

test('logout clears the library and the stored session through the injected seams', async () => {
  install();
  const calls: string[] = [];
  setLibraryDb(
    fakeLibraryDb({
      clearLibrary: async () => {
        calls.push('clearLibrary');
      },
    }),
  );
  setDownloadRuntime({ clearFiles: async () => {}, clear: async () => {} });
  values.set('navidrome-session', '{}');
  values.set('analysis-token', 'secret');
  await logout();
  assert.deepEqual(calls, ['clearLibrary']);
  assert.equal(values.size, 0);
});
