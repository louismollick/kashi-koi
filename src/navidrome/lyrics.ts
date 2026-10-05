import type { StructuredLyrics } from './subsonic';
import type { Line, Occurrence, SongLyrics } from '@/types/domain';

/** Prefer Japanese synced lyrics, then any synced entry. */
export function pickEntry(entries: StructuredLyrics[]) {
  return entries.find(entry => entry.synced && ['ja', 'jpn'].includes(entry.lang?.toLowerCase() ?? '')) ?? entries.find(entry => entry.synced);
}

/** Blank entries end the preceding line; repeated text shares one learning identity. */
export function toSongLyrics(songId: string, entry: StructuredLyrics, durationMs: number): SongLyrics {
  const entries = entry.line.map(line => {
    if (typeof line.start !== 'number' || !Number.isFinite(line.start) || typeof line.value !== 'string') throw new Error('Invalid synced lyrics');
    return { text: line.value.trim(), startMs: line.start - (entry.offset ?? 0) };
  }).sort((a, b) => a.startMs - b.startMs);
  const lines = new Map<string, Line>();
  const timeline: Occurrence[] = [];
  entries.forEach((entry, index) => {
    if (!entry.text) return;
    const id = `${songId}:${entry.text}`;
    lines.set(id, { id, segments: [{ text: entry.text }] });
    timeline.push({ lineId: id, startMs: entry.startMs, endMs: Math.max(entry.startMs, entries[index + 1]?.startMs ?? durationMs) });
  });
  return { songId, lines: [...lines.values()], timeline };
}

/** Keep the preceding line through gaps; -1 only before the first occurrence. */
export function currentOccurrence(timeline: Occurrence[], positionMs: number) {
  let low = 0, high = timeline.length - 1, index = -1;
  while (low <= high) { const mid = (low + high) >>> 1; if (timeline[mid]!.startMs <= positionMs) { index = mid; low = mid + 1; } else high = mid - 1; }
  return index;
}
