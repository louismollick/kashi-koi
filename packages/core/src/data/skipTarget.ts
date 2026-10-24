import { useRef } from 'react';
import { appStore } from '../store/appStore';
import { getLyrics, nextSentenceAfter } from '../store/libraryStore';
import { settingsStore } from '../store/settingsStore';

/** CONTINUE only skips ahead when the next sentence is at least this far off, in listening time. */
const minSkipMs = 1000;

/**
 * Where the quiz's CONTINUE can skip to: the next sentence's first line, once the quiz has nothing left to answer
 * (`settled`). Whether it is far enough off is decided once per target, when it is first offered, so the button doesn't
 * flicker out as the song closes in on it.
 */
export function useSkipTarget(songId: string | null, settled: boolean) {
  const lineIndex = appStore((state) => state.lineIndex);
  const target = settled ? nextSentenceAfter(songId, lineIndex) : undefined;
  const offer = useRef<{ songId: string | null; start: number; skip: boolean } | null>(null);
  if (!target) return undefined;
  if (offer.current?.songId !== songId || offer.current.start !== target.start) {
    const startMs = getLyrics(songId).timeline[target.start]?.startMs ?? 0;
    const away = (startMs - appStore.getState().positionMs) / settingsStore.getState().playbackRate;
    offer.current = { songId, start: target.start, skip: away >= minSkipMs };
  }
  return offer.current.skip ? target.start : undefined;
}
