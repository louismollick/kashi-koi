import { getLineText, getLyrics, libraryStore, type Translations } from '@/store/libraryStore';
import { alignReading, isJapanese } from './text';

export type TranslationStatus = 'installed' | 'supported' | 'unsupported';
export type Token = { surface: string; reading?: string };
export type Translator = {
  translationStatus(): Promise<TranslationStatus>; prepareTranslation(): Promise<TranslationStatus>;
  translate(texts: string[]): Promise<string[]>; tokenize(texts: string[]): Promise<Token[][]>;
};
const noop: Translator = { translationStatus: async () => 'unsupported', prepareTranslation: async () => 'unsupported', translate: async () => [], tokenize: async () => [] };
let translator = noop, save: (translations: Translations) => Promise<void> = async () => {};
let running: Promise<void> | null = null, persisting: Promise<void> | null = null, generation = 0, active = false, foreground = true;
let priority: string[] = [], failed = new Set<string>(), queue: string[] = [], cursor = 0, queueDirty = true;

/** Inject native translation and persistence without importing either in Node. */
export function setTranslator(next: Translator, persist: typeof save) { translator = next; save = persist; }
const needsTranslation = (id: string) => getLyrics(id).lines.some(line => !line.translation && isJapanese(getLineText(line)));
const textsFor = (id: string) => [...new Set(getLyrics(id).lines.filter(line => !line.translation).map(getLineText).filter(text => isJapanese(text) && !libraryStore.getState().translations[text]))];

// Library replacements and lyrics scans change both maps. Batch publication changes only lyrics.
libraryStore.subscribe((state, previous) => {
  if (state.songs !== previous.songs && state.lyrics !== previous.lyrics) {
    queueDirty = true;
    if (active && state.translationStatus === 'installed') void work();
  }
});

/** Playback's song and remaining queue go ahead of the library backlog. */
export function prioritizeTranslations(ids: string[]) {
  priority = [...new Set([...ids, ...priority])]; queueDirty = true;
  if (active && libraryStore.getState().translationStatus === 'installed') void work();
}
function rebuildQueue() {
  queue = [...new Set([...priority, ...libraryStore.getState().songs.map(song => song.id)])].filter(id => !failed.has(id) && needsTranslation(id));
  cursor = 0; queueDirty = false;
  libraryStore.setState({ translationSongIds: new Set(queue) });
}

/** One serial worker saves and applies each song, including songs with fully cached texts. */
function work() {
  if (running) return running;
  if (!active || libraryStore.getState().translationStatus !== 'installed') return Promise.resolve();
  const version = generation, service = translator, persist = save;
  const valid = () => active && version === generation && libraryStore.getState().translationStatus === 'installed';
  queueDirty = true;
  running = (async () => {
    let completed = 0;
    while (valid()) {
      if (queueDirty) rebuildQueue();
      const id = queue[cursor++];
      if (!id) break;
      libraryStore.setState({ translationProgress: { completed, total: completed + queue.length - cursor + 1 } });
      try {
        const texts = textsFor(id);
        if (texts.length) {
          const tokens = await service.tokenize(texts);
          if (!valid()) break;
          const translations = await service.translate(texts);
          if (!valid()) break;
          if (translations.length !== texts.length || tokens.length !== texts.length || translations.some(text => !text.trim())) throw new Error('Invalid translation batch');
          const result: Translations = Object.fromEntries(texts.map((text, index) => {
            const segments = tokens[index]!.flatMap(token => alignReading(token.surface, token.reading));
            if (segments.map(segment => segment.text).join('') !== text) throw new Error('Invalid tokenizer batch');
            return [text, { translation: translations[index]!, segments }];
          }));
          const pending = persist(result); persisting = pending;
          try { await pending; } finally { if (persisting === pending) persisting = null; }
          if (!valid()) break;
          libraryStore.getState().applyTranslationsToSong(id, result);
        } else libraryStore.getState().applyTranslationsToSong(id);
      } catch (error) {
        if (!valid()) break;
        failed.add(id);
        libraryStore.setState({ translationError: error instanceof Error ? error.message : 'Could not translate lyrics' });
      }
      // Membership is consumed by a per-song selector, so removing one ID needs no Set copy.
      libraryStore.getState().translationSongIds.delete(id);
      completed++;
    }
  })().finally(() => {
    running = null;
    if (valid()) libraryStore.setState({ translationProgress: null });
  });
  return running;
}

/** Retry skipped batches after launch, a scan, or a return to the foreground. */
export async function resumeTranslations() {
  if (!foreground) return;
  active = true; failed.clear(); queueDirty = true;
  const version = generation;
  try {
    const status = await translator.translationStatus();
    if (!active || version !== generation) return;
    libraryStore.setState({ translationStatus: status, translationError: null });
    if (status === 'installed') { await running; if (!active || version !== generation) return; await work(); }
    else libraryStore.setState({ translationSongIds: new Set() });
  } catch (error) { if (version === generation) libraryStore.setState({ translationError: error instanceof Error ? error.message : 'Could not check Japanese translation' }); }
}

/** Invalidate native work immediately; logout waits only for a save already touching SQLite. */
export async function pauseTranslations(reset = false) {
  active = false; generation++; queueDirty = true;
  libraryStore.setState({ translationSongIds: new Set(), translationProgress: null });
  if (reset) { priority = []; failed.clear(); libraryStore.setState({ translationStatus: null, translationError: null }); }
  await persisting?.catch(() => {});
}

export async function prepareTranslation() {
  const version = generation;
  const status = await translator.prepareTranslation();
  if (version === generation) { libraryStore.setState({ translationStatus: status }); if (active) void resumeTranslations(); }
  return status;
}

/** Player copy shares the store's translation readiness rule. */
export function translationHint(id: string) {
  const state = libraryStore.getState();
  return state.translationSongIds.has(id) ? 'Translating…' : state.translationStatus !== 'installed' ? 'Download Japanese translation in Settings' : 'No translations yet';
}

/** Scans may finish in the background, but only the foreground can start translation. */
export function setTranslationForeground(value: boolean) {
  foreground = value;
  return value ? resumeTranslations() : pauseTranslations();
}
