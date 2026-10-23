export type { FogTile, LineFog } from '../types/domain';
import type { FogTile, LineFog, SongLyrics } from '../types/domain';

/** Apply a tested sentence answer to its lines without changing the previous map. */
export function applyAnswer(fog: Record<string, LineFog>, lineIds: string[], correct: boolean, runId: string) {
  const next = { ...fog };
  for (const id of new Set(lineIds)) {
    const line = fog[id];
    if (correct) {
      next[id] = !line
        ? { state: 'half', run: runId }
        : line.state === 'half' && line.run === runId
          ? line
          : { state: 'clear' };
    } else if (line?.state === 'half') delete next[id];
    else if (line?.state === 'clear') next[id] = { state: 'red' };
  }
  return next;
}

/** Distinct translated sentences the quiz can ask, in first-occurrence order. */
export function quizSentences(lyrics: SongLyrics) {
  const byId = new Map(lyrics.sentences.map((sentence) => [sentence.id, sentence])),
    ids = [...new Set(lyrics.sentenceTimeline.map((occurrence) => occurrence.sentenceId))];
  return ids.flatMap((id) => {
    const sentence = byId.get(id);
    return sentence?.translation ? [sentence] : [];
  });
}

/** A sentence keeps its weakest line; only half and clear contribute progress. */
export function lyricsFog(lyrics: SongLyrics, fog: Record<string, LineFog>) {
  const order: FogTile[] = ['fog', 'red', 'half', 'clear'],
    tiles = quizSentences(lyrics).map((sentence) =>
      sentence.lineIds.reduce<FogTile>(
        (weakest, id) => {
          const tile = fog[id]?.state ?? 'fog';
          return order.indexOf(tile) < order.indexOf(weakest) ? tile : weakest;
        },
        sentence.lineIds.length ? 'clear' : 'fog',
      ),
    );
  const credit = tiles.reduce((sum, tile) => sum + (tile === 'clear' ? 1 : tile === 'half' ? 0.5 : 0), 0);
  return { tiles, percent: tiles.length ? Math.round((100 * credit) / tiles.length) : 0 };
}
