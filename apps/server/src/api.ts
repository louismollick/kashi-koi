import { createHash, timingSafeEqual } from 'node:crypto';
import { fingerprint } from '@kashi-koi/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { type BreakdownAnalyzer, CodexAnalyzer, UsageLimitError } from './analyzer/index.ts';
import { BreakdownBusyError, createBreakdownGenerator } from './breakdowns.ts';
import type { Store } from './db/index.ts';
import { errorMessage } from './worker.ts';

export const MAX_BODY_BYTES = 512 * 1024;
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const requestSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300).optional(),
  lines: z
    .array(z.string().regex(/\S/).max(300))
    .min(1)
    .max(200)
    .refine((lines) => lines.some((line) => japanese.test(line)), 'Japanese lyrics are required'),
  force: z.boolean().optional(),
});
const digest = (value: string) => createHash('sha256').update(value).digest();

/** Public cached reads; generation requires the owner's bearer token. */
export function createApi(store: Store, adminToken: string, analyzer: BreakdownAnalyzer = new CodexAnalyzer()) {
  if (!adminToken.trim()) throw new Error('KASHI_ADMIN_TOKEN is required');
  const expectedToken = digest(adminToken);
  const authorized = (authorization = '') => {
    const match = /^Bearer (.+)$/.exec(authorization);
    return timingSafeEqual(digest(match?.[1] ?? ''), expectedToken) && !!match;
  };
  const generateBreakdown = createBreakdownGenerator(store, analyzer);
  const app = new Hono();
  app.onError(
    () =>
      new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/v1/analyses/:fingerprint/breakdowns/:start', (c) => {
    c.header('Cache-Control', 'no-store');
    const raw = c.req.param('start');
    const start = Number(raw);
    const breakdown =
      /^\d+$/.test(raw) && Number.isSafeInteger(start)
        ? store.getBreakdown(c.req.param('fingerprint'), start)
        : undefined;
    return breakdown ? c.json(breakdown) : c.json({ error: 'Not found' }, 404);
  });
  app.post('/v1/analyses/:fingerprint/breakdowns/:start', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!authorized(c.req.header('Authorization'))) return c.json({ error: 'Unauthorized' }, 401);
    const fingerprint = c.req.param('fingerprint');
    const raw = c.req.param('start');
    const start = Number(raw);
    const analysis = store.getAnalysis(fingerprint);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(start) || !analysis?.sentences.some((s) => s.start === start))
      return c.json({ error: 'Not found' }, 404);
    const cached = store.getBreakdown(fingerprint, start);
    if (cached) return c.json(cached);
    try {
      const breakdown = await generateBreakdown(fingerprint, start);
      return breakdown ? c.json(breakdown) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof BreakdownBusyError) return c.json({ error: 'Server busy' }, 503);
      console.error(errorMessage(error, store.getAnalysisSource(fingerprint)?.lines ?? []));
      return error instanceof UsageLimitError
        ? c.json({ error: 'Usage limit reached' }, 429)
        : c.json({ error: 'Breakdown generation failed' }, 502);
    }
  });
  app.get('/v1/analyses/:fingerprint', (c) => {
    const key = c.req.param('fingerprint');
    const job = store.getJob(key);
    c.header('Cache-Control', 'no-store');
    if (job?.status === 'queued' || job?.status === 'running') return c.json({ status: job.status }, 202);
    const analysis = store.getAnalysis(key);
    if (job?.status === 'failed' && (!analysis || job.updatedAt > Date.parse(analysis.createdAt)))
      return c.json({ status: 'failed', error: job.error }, 202);
    if (analysis) return c.json(analysis);
    return c.json({ error: 'Not found' }, 404);
  });
  app.post('/v1/analyses', async (c) => {
    if (!authorized(c.req.header('Authorization'))) return c.json({ error: 'Unauthorized' }, 401);
    if (!/^application\/json(?:\s*;|$)/i.test(c.req.header('Content-Type') ?? ''))
      return c.json({ error: 'Expected application/json' }, 415);

    // Count actual bytes, even if the sender supplies an incorrect Content-Length.
    const reader = c.req.raw.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let body: unknown;
    try {
      if (reader) {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_BODY_BYTES) {
            await reader.cancel();
            return c.json({ error: 'Request body is too large' }, 413);
          }
          chunks.push(chunk.value);
        }
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    } finally {
      reader?.releaseLock();
    }
    const result = requestSchema.safeParse(body);
    if (!result.success) return c.json({ error: 'Invalid analysis request' }, 400);
    const { title, artist, lines, force } = result.data;
    const key = fingerprint(lines);
    const analysis = store.getAnalysis(key);
    if (analysis && !force) return c.json(analysis);
    const job = store.enqueue({ fingerprint: key, title, artist, lines, priority: 1 }, force);
    return c.json({ fingerprint: key, status: job.status }, 202);
  });
  return app;
}
