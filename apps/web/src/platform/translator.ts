import type { Token, Translator } from '@kashi-koi/core/japanese/translate';
import type { TokenizeRequest, TokenizeResponse } from './tokenizer.worker';

/** The one tokenizer worker, started by the first `tokenize` call. kuromoji and its dictionary load inside it. */
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (tokens: Token[][]) => void; reject: (error: Error) => void }>();

/** Fail every waiting request and drop the worker, so the next call starts a fresh one. */
function reset(error: Error) {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

function startWorker() {
  const next = new Worker(new URL('./tokenizer.worker.ts', import.meta.url), { type: 'module' });
  next.onmessage = ({ data }: MessageEvent<TokenizeResponse>) => {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if ('error' in data) request?.reject(new Error(data.error));
    else request?.resolve(data.tokens);
  };
  next.onerror = () => reset(new Error('Could not start the Japanese tokenizer'));
  return next;
}

/**
 * Browsers have no on-device translation (ADR 0005), so the status is always `unsupported` and only songs with a song
 * analysis get translations; `translate` is never called. `tokenize` gives furigana: kuromoji with IPADIC in a Web
 * Worker, behind the same contract as the iOS tokenizer.
 */
export const webTranslator: Translator = {
  unavailableHint: 'No song analysis yet',
  translationStatus: async () => 'unsupported',
  prepareTranslation: async () => 'unsupported',
  translate: async () => {
    throw new Error('Translation is not available in the browser');
  },
  tokenize: (texts) =>
    new Promise((resolve, reject) => {
      worker ??= startWorker();
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, texts } satisfies TokenizeRequest);
    }),
};
