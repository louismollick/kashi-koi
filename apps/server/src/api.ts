import { createHash, timingSafeEqual } from 'node:crypto';
import { fingerprint } from '@kashi-koi/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Store } from './db/index.ts';

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

/** Public lookups; only the owner can enqueue subscription-backed analyses. */
export function createApi(store: Store, adminToken: string) {
  if (!adminToken.trim()) throw new Error('KASHI_ADMIN_TOKEN is required');
  const expectedToken = digest(adminToken);
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
    const authorization = c.req.header('Authorization') ?? '';
    const match = /^Bearer (.+)$/.exec(authorization);
    const authorized = timingSafeEqual(digest(match?.[1] ?? ''), expectedToken);
    if (!match || !authorized) return c.json({ error: 'Unauthorized' }, 401);
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
