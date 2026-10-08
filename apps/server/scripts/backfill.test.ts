import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { backfill } from '../src/backfill.ts';
import { openDatabase } from '../src/db/index.ts';

test('backfill queues ordered synced Japanese lyrics, skips duplicates and continues after bad songs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kashi-backfill-test-'));
  const store = openDatabase(directory);
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  const japaneseLines = ['きみの声', 'まだ聞こえる'];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith('/search3.view')) {
      return Response.json({
        'subsonic-response': {
          status: 'ok',
          searchResult3: {
            song: [
              { id: 'first', title: '声', artist: 'Original' },
              { id: 'duplicate', title: '別の名前' },
              { id: 'english', title: 'English' },
              { id: 'unsynced', title: '雨' },
              { id: 'broken', title: '空' },
            ],
          },
        },
      });
    }
    if (url.searchParams.get('id') === 'broken') return Response.json({}, { status: 500 });
    const id = url.searchParams.get('id');
    return Response.json({
      'subsonic-response': {
        status: 'ok',
        lyricsList: {
          structuredLyrics: [
            {
              synced: id !== 'unsynced',
              lang: 'und',
              kind: 'main',
              line:
                id === 'english'
                  ? [{ start: 0, value: 'The rain stops' }]
                  : [
                      { start: 2000, value: ' まだ聞こえる ' },
                      { start: 1000, value: 'きみの声' },
                      { start: 1500, value: ' ' },
                    ],
            },
            { synced: true, lang: 'ja', kind: 'pronunciation', line: [{ start: 0, value: 'きみのこえ' }] },
          ],
        },
      },
    });
  };
  try {
    assert.deepEqual(
      await backfill({ url: 'http://navidrome.invalid', username: 'owner', token: 'token', salt: 'salt' }, store),
      {
        songs: 5,
        queued: 1,
        existing: 1,
        skipped: 2,
        errors: 1,
      },
    );
    const job = store.getJob(fingerprint(japaneseLines));
    assert.ok(job);
    assert.equal(job.priority, 0);
    assert.equal(job.title, '声');
    assert.ok(
      calls
        .filter((url) => url.pathname.endsWith('/getLyricsBySongId.view'))
        .every((url) => !url.searchParams.has('enhanced')),
    );
  } finally {
    globalThis.fetch = originalFetch;
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
