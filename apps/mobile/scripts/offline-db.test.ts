import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { albums, artists, songLyrics, songs } from './fixtures';

test('SQLite atomically invalidates replacement breakdowns, rolls back interruptions, keeps identical-analysis caches and writes the library in batches', async () => {
  const sqlite = new DatabaseSync(':memory:');
  let interrupt = false,
    interruptDownloads = false,
    transactions = 0,
    statements = 0;
  const adapter = {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    runAsync: async (sql: string, ...params: SQLInputValue[]) => {
      statements++;
      if (interrupt && sql.startsWith('INSERT OR REPLACE INTO analyses')) throw new Error('Interrupted replacement');
      if (interruptDownloads && sql.startsWith('INSERT OR REPLACE INTO downloads') && params[0] === 'second')
        throw new Error('Interrupted enqueue');
      return sqlite.prepare(sql).run(...params);
    },
    getFirstAsync: async <T>(sql: string, ...params: SQLInputValue[]) =>
      (sqlite.prepare(sql).get(...params) ?? null) as T | null,
    getAllAsync: async <T>(sql: string, ...params: SQLInputValue[]) => sqlite.prepare(sql).all(...params) as T[],
  };
  const database = {
    ...adapter,
    withExclusiveTransactionAsync: async (work: (tx: typeof adapter) => Promise<void>) => {
      transactions++;
      sqlite.exec('BEGIN');
      try {
        await work(adapter);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const key = Symbol.for('kashi.offline.sqlite');
  const globals = globalThis as typeof globalThis & { [key]: typeof database | undefined };
  globals[key] = database;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return specifier === 'expo-sqlite' ? { url: 'test:sqlite', shortCircuit: true } : next(specifier, context);
    },
    load(url, context, next) {
      return url === 'test:sqlite'
        ? {
            format: 'commonjs',
            source: "exports.openDatabaseAsync = async () => globalThis[Symbol.for('kashi.offline.sqlite')];",
            shortCircuit: true,
          }
        : next(url, context);
    },
  });
  try {
    const db = await import('../src/navidrome/db');
    const fp = fingerprint(['猫']);
    const analysis: SongAnalysis = {
      schemaVersion: 3,
      fingerprint: fp,
      model: 'test',
      createdAt: '2026-10-11T00:00:00Z',
      title: 'Cat',
      about: 'A cat.',
      lines: ['Cat'],
      sentences: [{ start: 0, end: 0, translation: 'Cat', quiz: null }],
    };
    const breakdown: Breakdown = {
      fingerprint: fp,
      start: 0,
      model: 'test',
      createdAt: analysis.createdAt,
      chunks: [
        {
          text: '猫',
          reading: 'ねこ',
          role: 'noun',
          english: ['Cat'],
          steps: [{ japanese: '猫', reading: 'ねこ', english: 'cat' }],
          note: '',
        },
      ],
    };
    await db.saveAnalysis(analysis);
    await db.saveBreakdown(breakdown);
    const replacement = { ...analysis, title: 'Another cat' };
    interrupt = true;
    await assert.rejects(db.saveAnalysis(replacement), /Interrupted replacement/);
    assert.deepEqual(await db.readBreakdown(fp, 0), breakdown);
    interrupt = false;
    await db.saveAnalysis(replacement);
    assert.equal(await db.readBreakdown(fp, 0), undefined);
    await db.saveBreakdown(breakdown);
    await db.saveAnalysis(replacement);
    assert.deepEqual(await db.readBreakdown(fp, 0), breakdown);
    await db.saveDownload('song', { status: 'downloading', fileName: 'song.flac', createdAt: 1, updatedAt: 2 });
    assert.equal((await db.loadDownloads()).song?.fileName, 'song.flac');
    await db.clearDownloads();
    assert.deepEqual(await db.loadDownloads(), {});
    const queued = {
      status: 'queued' as const,
      createdAt: 1,
      updatedAt: 1,
      fileName: undefined,
      bytes: undefined,
      error: undefined,
    };
    const before = transactions;
    await db.saveDownloads({ first: queued, second: queued });
    assert.equal(transactions - before, 1);
    assert.deepEqual(await db.loadDownloads(), { first: queued, second: queued });
    await db.clearDownloads();
    interruptDownloads = true;
    await assert.rejects(db.saveDownloads({ first: queued, second: queued }), /Interrupted enqueue/);
    assert.deepEqual(await db.loadDownloads(), {});
    // Library write path: set-based replace that keeps lyrics, one transaction per scan batch, in-place updates.
    const [first, second] = songs.map((song) => ({ ...song, lyricsStatus: 'unchecked' as const }));
    const status = async () =>
      Object.fromEntries((await db.loadAll()).songs.map((song) => [song.id, song.lyricsStatus]));
    let writes = { transactions, statements };
    await db.replaceLibrary({ songs: [first!, second!], albums, artists });
    assert.deepEqual(
      { transactions: transactions - writes.transactions, statements: statements - writes.statements },
      {
        transactions: 1,
        statements: 7,
      },
    );
    writes = { transactions, statements };
    await db.saveLyricsResults([
      { songId: first!.id, status: 'synced', lyrics: songLyrics[first!.id] },
      { songId: second!.id, status: 'synced', lyrics: songLyrics[second!.id] },
      { songId: 'removed', status: 'synced', lyrics: songLyrics[first!.id] },
    ]);
    assert.equal(transactions - writes.transactions, 1);
    assert.deepEqual(await status(), { [first!.id]: 'synced', [second!.id]: 'synced' });
    const loaded = (await db.loadAll()).lyrics;
    assert.deepEqual(Object.keys(loaded).sort(), [first!.id, second!.id].sort());
    // Cached lyrics are raw: sentences and fingerprints are derived by the store on load.
    assert.equal(loaded[first!.id]!.sentences, undefined);
    assert.equal(loaded[first!.id]!.timeline.length, songLyrics[first!.id]!.timeline.length);
    await db.savePlayed(first!.id, 12345);
    const played = (await db.loadAll()).songs.find((song) => song.id === first!.id);
    assert.equal(played?.played, 12345);
    assert.equal(played?.lyricsStatus, 'synced');
    // A sync keeps lyrics of surviving songs untouched and prunes those of removed songs.
    await db.replaceLibrary({ songs: [{ ...played!, lyricsStatus: 'synced' }], albums, artists });
    assert.deepEqual(Object.keys((await db.loadAll()).lyrics), [first!.id]);
    assert.deepEqual((await db.loadAll()).lyrics[first!.id], loaded[first!.id]);
    await db.saveLyricsResults([{ songId: first!.id, status: 'none' }]);
    assert.deepEqual((await db.loadAll()).lyrics, {});
  } finally {
    hooks.deregister();
    delete globals[key];
    sqlite.close();
  }
});
