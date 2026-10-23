import type { Translator } from '@kashi-koi/core/japanese/translate';

/**
 * Browsers have no on-device translation (ADR 0005), so the status is always `unsupported` and only songs with a song
 * analysis get translations. Core still asks the translator to tokenize every Japanese line; this stub answers with
 * the whole line as one token and no readings. Phase 3 replaces it with kuromoji in a Web Worker.
 */
export const webTranslator: Translator = {
  translationStatus: async () => 'unsupported',
  prepareTranslation: async () => 'unsupported',
  translate: async () => {
    throw new Error('Translation is not available in the browser');
  },
  tokenize: async (texts) => texts.map((surface) => [{ surface }]),
};

/**
 * Where core saves tokenized lines. Phase 2 saves nothing, so the stub's reading-less tokens are never cached in
 * IndexedDB (core would then never re-tokenize those lines once kuromoji exists). Phase 3 drops this argument from
 * `setTranslator` to use the library database.
 */
export const discardTranslations = async () => {};
