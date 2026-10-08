import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SongAnalysis } from '@kashi-koi/shared';
import Database from 'better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { analyses, type EnqueueInput, jobs } from './schema.ts';

/** Open the local store and apply the checked-in migrations before serving requests. */
export function openDatabase(dataDir = process.env.KASHI_DATA_DIR ?? './data') {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(join(dataDir, 'kashi.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('secure_delete = ON');
  const db = drizzle(sqlite);
  try {
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  } catch (error) {
    sqlite.close();
    throw error;
  }

  const getJob = (fingerprint: string) => db.select().from(jobs).where(eq(jobs.fingerprint, fingerprint)).get();
  const getAnalysis = (fingerprint: string) =>
    db.select().from(analyses).where(eq(analyses.fingerprint, fingerprint)).get()?.json;

  return {
    close: () => sqlite.close(),
    getAnalysis,
    getJob,
    /** Active jobs dedupe even with force, so a running analysis cannot be replaced underneath the worker. */
    enqueue(input: EnqueueInput, force = false) {
      return db.transaction(() => {
        const existing = getJob(input.fingerprint);
        if (existing?.status === 'running') return existing;
        if (existing?.status === 'queued' && !force) {
          if (input.priority > existing.priority) {
            db.update(jobs)
              .set({ priority: input.priority, updatedAt: Date.now() })
              .where(eq(jobs.fingerprint, input.fingerprint))
              .run();
          }
          return getJob(input.fingerprint) ?? existing;
        }
        const values = {
          ...input,
          artist: input.artist ?? null,
          status: 'queued' as const,
          attempts: 0,
          error: null,
          updatedAt: Date.now(),
        };
        db.insert(jobs).values(values).onConflictDoUpdate({ target: jobs.fingerprint, set: values }).run();
        const job = getJob(input.fingerprint);
        if (!job) throw new Error('Enqueued job is missing');
        return job;
      });
    },
    recoverRunning() {
      db.update(jobs).set({ status: 'queued' }).where(eq(jobs.status, 'running')).run();
    },
    /** Claim the oldest job at the highest priority and count its crash attempt. */
    claimNext() {
      return db.transaction(() => {
        const job = db
          .select()
          .from(jobs)
          .where(eq(jobs.status, 'queued'))
          .orderBy(sql`${jobs.priority} desc`, sql`${jobs.updatedAt} asc`, sql`rowid asc`)
          .get();
        if (!job) return undefined;
        db.update(jobs)
          .set({ status: 'running', attempts: Math.min(3, job.attempts + 1), updatedAt: Date.now() })
          .where(eq(jobs.fingerprint, job.fingerprint))
          .run();
        return {
          ...job,
          status: 'running' as const,
          attempts: Math.min(3, job.attempts + 1),
          exhausted: job.attempts >= 3,
        };
      });
    },
    complete(analysis: SongAnalysis) {
      db.transaction(() => {
        const values = {
          fingerprint: analysis.fingerprint,
          json: analysis,
          model: analysis.model,
          createdAt: analysis.createdAt,
        };
        db.insert(analyses).values(values).onConflictDoUpdate({ target: analyses.fingerprint, set: values }).run();
        db.update(jobs)
          .set({ status: 'done', lines: [], error: null, updatedAt: Date.now() })
          .where(eq(jobs.fingerprint, analysis.fingerprint))
          .run();
      });
    },
    fail(fingerprint: string, error: string) {
      db.update(jobs)
        .set({ status: 'failed', lines: [], error, updatedAt: Date.now() })
        .where(eq(jobs.fingerprint, fingerprint))
        .run();
    },
    retry(fingerprint: string, error: string, usageLimit = false) {
      db.update(jobs)
        .set({
          status: 'queued',
          error,
          attempts: usageLimit ? sql`max(0, ${jobs.attempts} - 1)` : jobs.attempts,
          updatedAt: Date.now(),
        })
        .where(and(eq(jobs.fingerprint, fingerprint), eq(jobs.status, 'running')))
        .run();
    },
  };
}

export type Store = ReturnType<typeof openDatabase>;
