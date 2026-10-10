import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { songAnalysisSchema, validateAnalysis, type SongAnalysis } from '@kashi-koi/shared/analysis';
import { isJapanese } from '@/japanese/text';
import type { Sentence, SentenceOccurrence, SongLyrics } from '@/types/domain';

export type LyricsInput = Pick<SongLyrics, 'songId' | 'lines' | 'timeline'> & Partial<SongLyrics>;
const text = (line: SongLyrics['lines'][number]) => line.segments.map((segment) => segment.text).join('');

/** Ordered timeline texts, including repeated lines, used by the analysis API. */
export function timelineTexts(lyrics: Pick<SongLyrics, 'lines' | 'timeline'>) {
  const lines = new Map(lyrics.lines.map((line) => [line.id, text(line)]));
  return lyrics.timeline.map((occurrence) => lines.get(occurrence.lineId) ?? '');
}

/** Derive learning sentences from a matching analysis, or Japanese lines as a fallback. */
export function withSentences(lyrics: LyricsInput, analysis?: SongAnalysis): SongLyrics {
  const texts = timelineTexts(lyrics);
  const hash = fingerprint(texts);
  const matched = analysis && analysis.fingerprint === hash && analysis.lines.length === texts.length;
  // Validate ranges even for callers supplying cached or test data directly.
  let accepted: SongAnalysis | undefined;
  if (matched) {
    const { schemaVersion: _version, fingerprint: _hash, model: _model, createdAt: _date, ...draft } = analysis;
    if (songAnalysisSchema.safeParse(analysis).success && !validateAnalysis(draft, texts.length).length)
      accepted = analysis;
  }
  const sentences = new Map<string, Sentence>();
  const sentenceTimeline: SentenceOccurrence[] = [];
  const ranges =
    accepted?.sentences ?? lyrics.timeline.map((_, index) => ({ start: index, end: index, translation: undefined }));
  for (const range of ranges) {
    const span = texts.slice(range.start, range.end + 1);
    if (!span.some(isJapanese)) continue;
    const lineIds = [...new Set(lyrics.timeline.slice(range.start, range.end + 1).map((item) => item.lineId))];
    const id = accepted ? `${lyrics.songId}:${span.join('\n')}` : lineIds[0]!;
    if (!sentences.has(id))
      sentences.set(id, {
        id,
        lineIds,
        ...('decoys' in range ? { decoys: range.decoys } : {}),
        translation: accepted ? range.translation : lyrics.lines.find((line) => line.id === id)?.translation,
      });
    sentenceTimeline.push({ sentenceId: id, start: range.start, end: range.end });
  }
  return {
    ...lyrics,
    fingerprint: hash,
    timeline: lyrics.timeline.map(({ translation: _old, ...occurrence }, index) =>
      accepted ? { ...occurrence, translation: accepted.lines[index] } : occurrence,
    ),
    sentences: [...sentences.values()],
    sentenceTimeline,
    analysis: accepted
      ? {
          title: accepted.title,
          summary: accepted.summary,
          speaker: accepted.speaker,
          addressee: accepted.addressee,
        }
      : undefined,
  };
}
