import type { StructuredLyrics } from './subsonic';
import { orderedLyricEntries } from '@kashi-koi/shared/lyrics';
import type { Line, Occurrence, SongLyrics } from '@/types/domain';

export { pickEntry } from '@kashi-koi/shared/lyrics';

/** Blank entries end the preceding line; repeated text shares one learning identity. */
export function toSongLyrics(songId: string, entry: StructuredLyrics, durationMs: number): SongLyrics {
  const entries = orderedLyricEntries(entry);
  const lines = new Map<string, Line>();
  const timeline: Occurrence[] = [];
  entries.forEach((entry, index) => {
    if (!entry.text) return;
    const id = `${songId}:${entry.text}`;
    lines.set(id, { id, segments: [{ text: entry.text }] });
    timeline.push({
      lineId: id,
      startMs: entry.startMs,
      endMs: Math.max(entry.startMs, entries[index + 1]?.startMs ?? durationMs),
    });
  });
  return { songId, lines: [...lines.values()], timeline };
}

/** Keep the preceding line through gaps; -1 only before the first occurrence. */
export function currentOccurrence(timeline: Occurrence[], positionMs: number) {
  let low = 0,
    high = timeline.length - 1,
    index = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (timeline[mid]!.startMs <= positionMs) {
      index = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return index;
}
