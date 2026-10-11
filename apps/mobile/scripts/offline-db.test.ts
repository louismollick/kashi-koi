import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { fingerprint } from '@kashi-koi/shared/fingerprint';

test('SQLite atomically invalidates replacement breakdowns, rolls back interruptions, and keeps identical-analysis caches', async () => {
  const sqlite = new DatabaseSync(':memory:');
  let interrupt = false;
  const adapter = {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    runAsync: async (sql: string, ...params: SQLInputValue[]) => {
      if (interrupt && sql.startsWith('INSERT OR REPLACE INTO analyses')) throw new Error('Interrupted replacement');
      return sqlite.prepare(sql).run(...params);
    },
    getFirstAsync: async <T>(sql: string, ...params: SQLInputValue[]) =>
      (sqlite.prepare(sql).get(...params) ?? null) as T | null,
    getAllAsync: async <T>(sql: string, ...params: SQLInputValue[]) => sqlite.prepare(sql).all(...params) as T[],
  };
  const database = {
    ...adapter,
    withExclusiveTransactionAsync: async (work: (tx: typeof adapter) => Promise<void>) => {
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
  } finally {
    hooks.deregister();
    delete globals[key];
    sqlite.close();
  }
});
