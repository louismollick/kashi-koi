import type { ReviewList, SongLyrics } from '@/types/domain';

/** Move changed sentence identities by surviving lines and retain the earliest schedule. */
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
  return [...merged.values()];
}
