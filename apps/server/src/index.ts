import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { type Analyzer, CodexAnalyzer } from './analyzer/index.ts';
import { createApi } from './api.ts';
import { openDatabase, type Store } from './db/index.ts';
import { Worker } from './worker.ts';

/** Start one API and worker together, recovering jobs interrupted by an earlier process. */
export function startServer(options: { store: Store; analyzer: Analyzer; adminToken: string; port?: number }) {
  const { store, analyzer, adminToken, port = 8787 } = options;
  const app = createApi(store, adminToken);
  store.recoverRunning();
  const abort = new AbortController();
  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
  const running = new Worker(store, analyzer).run(abort.signal);
  let closing: Promise<void> | undefined;
  function close() {
    if (closing) return closing;
    abort.abort();
    const closed = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      if ('closeIdleConnections' in server) server.closeIdleConnections();
    });
    closing = Promise.all([closed, running])
      .then(() => undefined)
      .finally(() => store.close());
    return closing;
  }
  // A queue/database fault must stop the API too, rather than leave a healthy-looking dead worker.
  void running.catch(() => {
    console.error('Worker stopped unexpectedly');
    process.exitCode = 1;
    void close().catch(() => {
      process.exitCode = 1;
    });
  });
  return { server, close };
}

export function main() {
  const adminToken = process.env.KASHI_ADMIN_TOKEN;
  if (!adminToken?.trim()) throw new Error('KASHI_ADMIN_TOKEN is required');
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const instance = startServer({ store: openDatabase(), analyzer: new CodexAnalyzer(), adminToken, port });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void instance.close().catch(() => {
        console.error('Server shutdown failed');
        process.exitCode = 1;
      });
    });
  }
  return instance;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
