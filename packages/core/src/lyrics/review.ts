import { isSongAvailable } from '@/data/libraryVisibility';
import { getLyrics, hasTranslations } from '@/store/libraryStore';
import type { ReviewList, SongLyrics } from '@/types/domain';

/**
 * The Review list rules: how a sentence enters (lost mark, miss), moves on (right or wrong answer, edit), becomes due
 * and survives lyric or library changes. The stores own the list and call these functions.
 */

const dayMs = 24 * 60 * 60 * 1000;

/** Correct answers double the interval, starting at one day; a miss makes the sentence due again. */
export function scheduleReview(item: ReviewList[number], correct: boolean, now = Date.now()): ReviewList[number] {
  const { id, songId, sentenceId } = item;
  if (!correct) return { id, songId, sentenceId, kind: 'due', misses: item.kind === 'due' ? item.misses + 1 : 1 };
  const step = item.kind === 'later' ? item.step + 1 : 0;
  return { id, songId, sentenceId, kind: 'later', step, dueAt: now + 2 ** step * dayMs };
}

/** A lost mark adds the sentence as a New sentence with `id`, unless some entry already holds it. */
export function addLostMark(list: ReviewList, id: string, songId: string, sentenceId: string): ReviewList {
  if (list.some((item) => item.sentenceId === sentenceId)) return list;
  return [...list, { id, songId, sentenceId, kind: 'new' }];
}

/** A tested answer reschedules the sentence's entry; a miss with no entry adds a due one with `missId`. */
export function recordAnswer(
  list: ReviewList,
  songId: string,
  sentenceId: string,
  correct: boolean,
  missId: string,
): ReviewList {
  const matches = (item: ReviewList[number]) => item.songId === songId && item.sentenceId === sentenceId;
  const updated = list.map((item) => (matches(item) ? scheduleReview(item, correct) : item));
  if (!correct && !list.some(matches)) updated.push({ id: missId, songId, sentenceId, kind: 'due', misses: 1 });
  return updated;
}

/** Edit an entry onto another sentence of its song, as a New sentence again. Returns `list` itself when the move is not allowed. */
export function moveReview(list: ReviewList, id: string, sentenceId: string): ReviewList {
  const item = list.find((entry) => entry.id === id);
  if (
    !item ||
    item.sentenceId === sentenceId ||
    !getLyrics(item.songId).sentences.some((sentence) => sentence.id === sentenceId) ||
    list.some((entry) => entry.id !== id && entry.sentenceId === sentenceId)
  )
    return list;
  return list.map((entry) => (entry.id === id ? { id, songId: entry.songId, sentenceId, kind: 'new' } : entry));
}

/** New sentences and misses are ready now; scheduled sentences return at their due time. */
export const isDue = (item: ReviewList[number], now = Date.now()) => item.kind !== 'later' || item.dueAt <= now;

/** Due today excludes the separate New sentence group. */
export const dueSentences = (list: ReviewList, now = Date.now()) =>
  list.filter((item) => item.kind !== 'new' && isDue(item, now));

/** Clip review needs an available song with a surviving sentence, fully translated. */
export const readyReviewSentences = (list: ReviewList, now = Date.now()) =>
  list.filter(
    (item) =>
      isSongAvailable(item.songId) &&
      isDue(item, now) &&
      hasTranslations(item.songId) &&
      getLyrics(item.songId).sentences.some((sentence) => sentence.id === item.sentenceId),
  );

/** Drop entries for songs that left the library. Returns `list` itself when nothing was dropped. */
export function pruneReview(list: ReviewList, songIds: ReadonlySet<string>): ReviewList {
  const kept = list.filter((item) => songIds.has(item.songId));
  return kept.length === list.length ? list : kept;
}

/** Remap `list` for every song whose lyrics differ between two library snapshots. */
export function remapChangedSongs(
  list: ReviewList,
  before: Record<string, SongLyrics>,
  after: Record<string, SongLyrics>,
): ReviewList {
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (after[id] !== before[id]) list = remapReview(list, id, before[id], after[id]);
  }
  return list;
}

/** Move changed sentence identities by surviving lines and retain the earliest schedule. Returns `list` itself when nothing changed. */
export function remapReview(
  list: ReviewList,
  songId: string,
  before: SongLyrics | undefined,
  after: SongLyrics | undefined,
): ReviewList {
  const merged = new Map<string, ReviewList[number]>();
  for (const item of list) {
    if (item.songId !== songId) {
      merged.set(item.id, item);
      continue;
    }
    const oldLines =
      before?.sentences.find((sentence) => sentence.id === item.sentenceId)?.lineIds ??
      (item.sentenceId.startsWith(`${songId}:`)
        ? item.sentenceId
            .slice(songId.length + 1)
            .split('\n')
            .map((text) => `${songId}:${text}`)
        : [item.sentenceId]);
    const sentence =
      after?.sentences.find((sentence) => sentence.id === item.sentenceId) ??
      after?.sentences.find((sentence) => sentence.lineIds.some((lineId) => oldLines.includes(lineId)));
    if (!sentence) continue;
    const updated = sentence.id === item.sentenceId ? item : { ...item, sentenceId: sentence.id };
    const key = `${songId}\n${sentence.id}`;
    const existing = merged.get(key);
    const dueAt = (entry: ReviewList[number]) => (entry.kind === 'later' ? entry.dueAt : -Infinity);
    if (
      !existing ||
      dueAt(updated) < dueAt(existing) ||
      (dueAt(updated) === dueAt(existing) && updated.kind === 'due' && existing.kind !== 'due')
    )
      merged.set(key, updated);
  }
  const remapped = [...merged.values()];
  return remapped.length === list.length && remapped.every((item, index) => item === list[index]) ? list : remapped;
}
