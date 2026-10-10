import type { Breakdown, SongAnalysis } from '@kashi-koi/shared';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const analyses = sqliteTable('analyses', {
  fingerprint: text('fingerprint').primaryKey(),
  lines: text('lines', { mode: 'json' }).$type<string[]>().notNull(),
  json: text('json', { mode: 'json' }).$type<SongAnalysis>().notNull(),
  model: text('model').notNull(),
  createdAt: text('created_at').notNull(),
});

export const breakdowns = sqliteTable(
  'breakdowns',
  {
    fingerprint: text('fingerprint').notNull(),
    start: integer('start').notNull(),
    json: text('json', { mode: 'json' }).$type<Breakdown>().notNull(),
    model: text('model').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.fingerprint, table.start] })],
);

export const jobs = sqliteTable(
  'jobs',
  {
    fingerprint: text('fingerprint').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist'),
    lines: text('lines', { mode: 'json' }).$type<string[]>().notNull(),
    priority: integer('priority').notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('jobs_queue_idx').on(table.status, table.priority, table.updatedAt)],
);

export type Job = typeof jobs.$inferSelect;
export type EnqueueInput = Pick<Job, 'fingerprint' | 'title' | 'lines' | 'priority'> & { artist?: string };
