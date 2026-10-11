import { validateBreakdown, type Breakdown } from '@kashi-koi/shared/breakdown';
import { create } from 'zustand';
import { isOfflineMode } from '@/data/offlineMode';
import { timelineTexts } from '@/lyrics/sentences';
import { getLyrics, libraryStore } from '@/store/libraryStore';
import { analysisServerUrl, analysisSession } from './fetcher';
import { fetchBreakdown, requestBreakdown } from './client';

const defaults = {
  read: async (fp: string, start: number) => (await import('@/navidrome/db')).readBreakdown(fp, start),
  save: async (value: Breakdown) => (await import('@/navidrome/db')).saveBreakdown(value),
  remove: async (fp: string) => (await import('@/navidrome/db')).deleteBreakdowns(fp),
};
let runtime = defaults;
let pendingPersistence = Promise.resolve();

/** Inject the unified SQLite cache for plain Node tests. */
export function setBreakdownRuntime(overrides: Partial<typeof defaults> = {}) {
  runtime = { ...defaults, ...overrides };
}
/** Order obsolete deletes after accepted writes and before later reads. */
function persist(work: () => Promise<void>) {
  const next = pendingPersistence.catch(() => {}).then(work);
  pendingPersistence = next;
  return next;
}
export const flushBreakdowns = () => pendingPersistence.catch(() => {});

export type BreakdownTarget = { fingerprint: string; start: number; text: string; translation: string };
export type BreakdownState =
  | { status: 'loading' }
  | { status: 'ready'; breakdown: Breakdown }
  | { status: 'failed'; error: string }
  | { status: 'missing' };

export const breakdownStore = create<{ states: Record<string, BreakdownState> }>(() => ({ states: {} }));
const requests = new Map<string, Promise<void>>();
let generation = 0;
let server = '';
const keyOf = (target: BreakdownTarget) => `${target.fingerprint}:${target.start}`;

/** Resolve repeated sentences to their first occurrence in the analyzed song. */
export function breakdownTarget(
  songId: string | null | undefined,
  sentenceId: string | null | undefined,
): BreakdownTarget | undefined {
  const lyrics = getLyrics(songId ?? null);
  if (!lyrics.analysis) return undefined;
  const sentence = lyrics.sentences.find((sentence) => sentence.id === sentenceId);
  const occurrence = lyrics.sentenceTimeline.find((occurrence) => occurrence.sentenceId === sentenceId);
  if (!sentence?.translation || !occurrence) return undefined;
  return {
    fingerprint: lyrics.fingerprint,
    start: occurrence.start,
    text: timelineTexts(lyrics)
      .slice(occurrence.start, occurrence.end + 1)
      .join('\n'),
    translation: sentence.translation,
  };
}

/** Clear transient results and invalidate responses belonging to a previous login or server. */
export function resetBreakdowns() {
  generation++;
  requests.clear();
  breakdownStore.setState({ states: {} });
}

/** Read the shared cache, then generate only when the owner has configured a token. */
export function loadBreakdown(
  songId: string | null | undefined,
  sentenceId: string | null | undefined,
  { cachedOnly = false, signal }: { cachedOnly?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const target = breakdownTarget(songId, sentenceId),
    session = analysisSession();
  if (!target || signal?.aborted) return Promise.resolve();
  if (session.base && server !== session.base) {
    resetBreakdowns();
    server = session.base;
  }
  const key = keyOf(target),
    version = generation;
  const existing = requests.get(key);
  if (existing) {
    if (!signal) return existing;
    // A download can stop waiting for a request started by an open sentence.
    return new Promise<void>((resolve) => {
      const finish = () => {
        signal.removeEventListener('abort', finish);
        resolve();
      };
      signal.addEventListener('abort', finish, { once: true });
      void existing.finally(finish);
      if (signal.aborted) finish();
    });
  }
  const state = breakdownStore.getState().states[key];
  if (state?.status === 'ready') return Promise.resolve();
  const source = libraryStore.getState().analyses[target.fingerprint];
  const valid = () =>
    !signal?.aborted &&
    version === generation &&
    session.valid() &&
    JSON.stringify(libraryStore.getState().analyses[target.fingerprint]) === JSON.stringify(source) &&
    JSON.stringify(breakdownTarget(songId, sentenceId)) === JSON.stringify(target);
  const update = (state: BreakdownState) => {
    if (valid()) breakdownStore.setState(({ states }) => ({ states: { ...states, [key]: state } }));
  };
  if (session.base || isOfflineMode()) update({ status: 'loading' });
  const work = (async () => {
    try {
      await flushBreakdowns();
      const cached = await runtime.read(target.fingerprint, target.start);
      if (!valid()) return;
      if (cached && !validateBreakdown({ chunks: cached.chunks }, target.text, target.translation).length) {
        update({ status: 'ready', breakdown: cached });
        return;
      }
      if (isOfflineMode() || !session.base) {
        if (isOfflineMode()) update({ status: 'missing' });
        return;
      }
      let result = await fetchBreakdown(
        session.base,
        target.fingerprint,
        target.start,
        target.text,
        target.translation,
        session.fetch,
        signal,
      );
      if (!valid()) return;
      if (result.status === 404 && session.token && !cachedOnly && !isOfflineMode()) {
        result = await requestBreakdown(
          session.base,
          session.token,
          target.fingerprint,
          target.start,
          target.text,
          target.translation,
          session.fetch,
        );
      }
      if (isOfflineMode() || !valid()) return;
      if (result.status === 200) {
        const value = result.breakdown,
          save = runtime.save;
        await persist(async () => {
          if (valid()) await save(value);
        });
      }
      update(result.status === 200 ? { status: 'ready', breakdown: result.breakdown } : { status: 'missing' });
    } catch (error) {
      const message =
        error instanceof Error && ['Server busy, try again', 'Usage limit reached, try later'].includes(error.message)
          ? error.message
          : 'Breakdown failed';
      update({ status: 'failed', error: message });
    }
  })().finally(() => {
    if (requests.get(key) === work) requests.delete(key);
  });
  requests.set(key, work);
  return work;
}

/** Owner-only background requests share the same cache and never reject. */
export function prefetchBreakdown(songId: string | null | undefined, sentenceId: string | null | undefined): void {
  if (!isOfflineMode() && analysisSession().token) void loadBreakdown(songId, sentenceId);
}

/**
 * Where each chunk's English pieces sit in the translation, in sentence order. Occurrences are assigned across all
 * chunks so two chunks meaning the same word ("you") get its first and second occurrence. Overlaps keep the first.
 */
export function englishSpans(translation: string, chunks: Breakdown['chunks']) {
  const spans: { start: number; end: number; chunk: number }[] = [];
  chunks.forEach((chunk, index) => {
    for (const piece of chunk.english) {
      for (let start = translation.indexOf(piece); start >= 0; start = translation.indexOf(piece, start + 1)) {
        const end = start + piece.length;
        if (spans.some((span) => start < span.end && span.start < end)) continue;
        spans.push({ start, end, chunk: index });
        break;
      }
    }
  });
  return spans.sort((a, b) => a.start - b.start);
}

export const canExplain = (songId: string | null | undefined) =>
  !!getLyrics(songId ?? null).analysis && (isOfflineMode() || !!analysisServerUrl());

/** Subscribe to lyrics and the target's transient request state; loading is an explicit action. */
export function useBreakdown(songId: string | null | undefined, sentenceId: string | null | undefined) {
  libraryStore((state) => state.lyrics[songId ?? '']);
  const target = breakdownTarget(songId, sentenceId);
  const state = breakdownStore((store) => (target ? store.states[keyOf(target)] : undefined));
  return { target, state };
}

// A replacement analysis deletes its server breakdowns. Drop those transient phone results too.
libraryStore.subscribe((state, previous) => {
  if (state.analyses === previous.analyses) return;
  const changed = Object.keys(previous.analyses).filter(
    (fp) =>
      state.analyses[fp] !== previous.analyses[fp] &&
      JSON.stringify(state.analyses[fp]) !== JSON.stringify(previous.analyses[fp]),
  );
  if (!changed.length) return;
  const remove = runtime.remove;
  void persist(async () => {
    for (const fp of changed) await remove(fp);
  }).catch(() => {});
  const obsolete = (key: string) => changed.some((fp) => key.startsWith(`${fp}:`));
  for (const key of requests.keys()) if (obsolete(key)) requests.delete(key);
  breakdownStore.setState(({ states }) => ({
    states: Object.fromEntries(Object.entries(states).filter(([key]) => !obsolete(key))),
  }));
});

/** Download preparation only reads existing server explanations; 404 never generates one. */
export async function cacheSongBreakdowns(songId: string, valid: () => boolean, signal?: AbortSignal) {
  for (const sentence of getLyrics(songId).sentences) {
    if (!valid() || isOfflineMode()) break;
    await loadBreakdown(songId, sentence.id, { cachedOnly: true, signal });
  }
}
