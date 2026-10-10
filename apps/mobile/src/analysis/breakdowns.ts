import type { Breakdown } from '@kashi-koi/shared/breakdown';
import { create } from 'zustand';
import { timelineTexts } from '@/lyrics/sentences';
import { getLyrics, libraryStore } from '@/store/libraryStore';
import { analysisServerUrl, analysisSession } from './fetcher';
import { fetchBreakdown, requestBreakdown } from './client';

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
export function loadBreakdown(songId: string | null | undefined, sentenceId: string | null | undefined): Promise<void> {
  const target = breakdownTarget(songId, sentenceId),
    session = analysisSession();
  if (!target || !session.base) return Promise.resolve();
  if (server !== session.base) {
    resetBreakdowns();
    server = session.base;
  }
  const key = keyOf(target),
    version = generation;
  const existing = requests.get(key);
  if (existing) return existing;
  const state = breakdownStore.getState().states[key];
  if (state?.status === 'ready') return Promise.resolve();
  const source = libraryStore.getState().analyses[target.fingerprint];
  const valid = () =>
    version === generation &&
    session.valid() &&
    libraryStore.getState().analyses[target.fingerprint] === source &&
    JSON.stringify(breakdownTarget(songId, sentenceId)) === JSON.stringify(target);
  const update = (state: BreakdownState) => {
    if (valid()) breakdownStore.setState(({ states }) => ({ states: { ...states, [key]: state } }));
  };
  update({ status: 'loading' });
  const work = (async () => {
    try {
      let result = await fetchBreakdown(
        session.base,
        target.fingerprint,
        target.start,
        target.text,
        target.translation,
        session.fetch,
      );
      if (!valid()) return;
      if (result.status === 404 && session.token) {
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
  if (analysisSession().token) void loadBreakdown(songId, sentenceId);
}

export const canExplain = (songId: string | null | undefined) =>
  !!getLyrics(songId ?? null).analysis && !!analysisServerUrl();

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
  const changed = Object.keys(previous.analyses).filter((fp) => state.analyses[fp] !== previous.analyses[fp]);
  if (!changed.length) return;
  const obsolete = (key: string) => changed.some((fp) => key.startsWith(`${fp}:`));
  for (const key of requests.keys()) if (obsolete(key)) requests.delete(key);
  breakdownStore.setState(({ states }) => ({
    states: Object.fromEntries(Object.entries(states).filter(([key]) => !obsolete(key))),
  }));
});
