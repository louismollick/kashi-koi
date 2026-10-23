import type { Token } from '@kashi-koi/core/japanese/translate';
import { TokenizerBuilder } from '@patdx/kuromoji';
import { gzipDictionaryLoader } from './dictionaryLoader';
import { toTokens } from './tokens';

/** Messages between `translator.ts` and this worker. */
export type TokenizeRequest = { id: number; texts: string[] };
export type TokenizeResponse = { id: number; tokens: Token[][] } | { id: number; error: string };

// The dictionary loads when the first request arrives, so a session that never tokenizes never downloads it.
let tokenizer: ReturnType<TokenizerBuilder['build']> | undefined;
const load = () =>
  (tokenizer ??= new TokenizerBuilder({
    loader: gzipDictionaryLoader(`${import.meta.env.BASE_URL}dict/`),
  })
    .build()
    // A failed load (offline, dictionary not cached yet) must not stick; the next request tries again.
    .catch((error) => {
      tokenizer = undefined;
      throw error;
    }));

self.onmessage = async ({ data }: MessageEvent<TokenizeRequest>) => {
  try {
    const built = await load();
    const tokens = data.texts.map((text) => toTokens(text, built.tokenize(text)));
    self.postMessage({ id: data.id, tokens } satisfies TokenizeResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not tokenize lyrics';
    self.postMessage({ id: data.id, error: message } satisfies TokenizeResponse);
  }
};
