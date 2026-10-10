import type { StructuredLyrics } from './subsonic.ts';
export type { StructuredLyrics } from './subsonic.ts';

/** Prefer Japanese synced main lyrics, then any synced main entry. */
export function pickEntry(entries: StructuredLyrics[]) {
  const main = entries.filter((entry) => entry.kind === undefined || entry.kind === 'main');
  return (
    main.find((entry) => entry.synced && ['ja', 'jpn'].includes(entry.lang?.toLowerCase() ?? '')) ??
    main.find((entry) => entry.synced)
  );
}

/** Keep blank timestamps to end app occurrences; both consumers use this ordering. */
export function orderedLyricEntries(entry: StructuredLyrics) {
  return entry.line
    .map((line) => {
      if (typeof line.start !== 'number' || !Number.isFinite(line.start) || typeof line.value !== 'string')
        throw new Error('Invalid synced lyrics');
      return { text: line.value.trim(), startMs: line.start - (entry.offset ?? 0) };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** Return every sung occurrence, including repeated text, in app timeline order. */
export function lyricLines(entry: StructuredLyrics) {
  return orderedLyricEntries(entry)
    .filter((line) => line.text.length > 0)
    .map((line) => line.text);
}
