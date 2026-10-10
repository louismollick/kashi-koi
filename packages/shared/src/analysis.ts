import { z } from 'zod';

const text = z.string().regex(/\S/, 'Must not be empty');
const lineIndex = z.number().int().nonnegative();
const decoySchema = z.strictObject({ phrase: z.string(), reason: text });
const quizSchema = z.strictObject({ phrase: z.string(), decoys: z.array(decoySchema) });
const sentenceSchema = z.strictObject({
  start: lineIndex,
  end: lineIndex,
  translation: text,
  quiz: quizSchema.nullable(),
});
const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]/u;

export type Decoy = z.infer<typeof decoySchema>;
export type Quiz = z.infer<typeof quizSchema>;

/** Build a full choice by replacing the first gap phrase, keeping replacement text literal. */
export function decoySentence(translation: string, phrase: string, decoy: Decoy): string {
  const start = translation.indexOf(phrase);
  return start < 0
    ? translation
    : translation.slice(0, start) + decoy.phrase + translation.slice(start + phrase.length);
}

export const songAnalysisDraftSchema = z.strictObject({
  title: text,
  about: text,
  lines: z.array(text),
  sentences: z.array(sentenceSchema),
});
export const songAnalysisSchema = songAnalysisDraftSchema.extend({
  sentences: z.array(sentenceSchema.refine((sentence) => !quizErrors(sentence, 0).length, 'Invalid quiz')),
  schemaVersion: z.literal(3),
  fingerprint: text,
  model: text,
  createdAt: text,
});

/** Required fields and nullable quizzes for OpenAI strict structured output. */
export const songAnalysisDraftJsonSchema = z.toJSONSchema(songAnalysisDraftSchema);
export type SongAnalysisDraft = z.infer<typeof songAnalysisDraftSchema>;
export type SongAnalysis = z.infer<typeof songAnalysisSchema>;

const structuralSchema = songAnalysisDraftSchema.extend({
  sentences: z.array(sentenceSchema.extend({ quiz: z.unknown() })),
});

/** Check structure and contiguous inclusive ranges; quiz failures are checked separately. */
export function validateAnalysis(draft: unknown, lineCount: number): string[] {
  if (!Number.isInteger(lineCount) || lineCount < 0) return ['Input line count must be a non-negative integer'];
  const result = structuralSchema.safeParse(draft);
  if (!result.success)
    return result.error.issues.map((issue) => `${issue.path.join('.') || 'Analysis'}: ${issue.message}`);
  const analysis = result.data;
  const errors: string[] = [];
  if (analysis.lines.length !== lineCount)
    errors.push(`Expected ${lineCount} line translations, received ${analysis.lines.length}`);
  let nextLine = 0;
  analysis.sentences.forEach((sentence, index) => {
    if (sentence.start !== nextLine)
      errors.push(`Sentence ${index} starts at line ${sentence.start}; expected ${nextLine} without gaps or overlaps`);
    if (sentence.end < sentence.start) errors.push(`Sentence ${index} ends before it starts`);
    if (sentence.start >= lineCount || sentence.end >= lineCount)
      errors.push(`Sentence ${index} is outside the input line range`);
    nextLine = sentence.end + 1;
  });
  if (nextLine !== lineCount) errors.push(`Sentences must cover all ${lineCount} input lines`);
  return errors;
}

/** Check one gap's phrases, optionally against the original lyric lines. Null means no quiz. */
export function quizErrors(
  sentence: { translation: string; quiz: unknown },
  index: number,
  lines?: string[],
): string[] {
  if (sentence.quiz === null) return [];
  const parsed = quizSchema.safeParse(sentence.quiz);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => `Sentence ${index} quiz ${issue.path.join('.')}: ${issue.message}`);
  const { phrase, decoys } = parsed.data;
  const errors: string[] = [];
  const prefix = `Sentence ${index} quiz`;
  if (lines && !lines.some((line) => japanese.test(line))) errors.push(`${prefix} must be null without Japanese`);
  if (!phrase.trim() || !sentence.translation.includes(phrase) || phrase.length >= sentence.translation.length)
    errors.push(`${prefix} phrase must occur in the translation and be shorter`);
  const lyricPhrase = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (phrase.trim() && lines?.some((line) => lyricPhrase.test(line)))
    errors.push(`${prefix} phrase is already shown in the lyrics`);
  if (decoys.length !== 2) errors.push(`${prefix} must have exactly 2 decoys`);
  const phrases = [phrase, ...decoys.map((decoy) => decoy.phrase)];
  if (phrases.some((value) => !value.trim() || value !== value.trim()))
    errors.push(`${prefix} phrases must be nonempty without leading or trailing whitespace`);
  if (new Set(phrases.map((value) => value.replace(/\s+/g, ' ').toLowerCase())).size !== phrases.length)
    errors.push(`${prefix} phrases must differ ignoring case and collapsed whitespace`);
  if (phrases.some((value) => japanese.test(value))) errors.push(`${prefix} phrases must be English`);
  return errors;
}

/** Collect hard quiz failures independently of fatal analysis structure. */
export function validateQuizzes(draft: unknown, lines?: string[]): string[] {
  const parsed = structuralSchema.safeParse(draft);
  if (!parsed.success) return [];
  return parsed.data.sentences.flatMap((sentence, index) =>
    quizErrors(sentence, index, lines?.slice(sentence.start, sentence.end + 1)),
  );
}

/** Preserve translations while dropping only invalid quizzes on the final attempt. */
export function dropInvalidQuizzes(draft: unknown, lines?: string[]): unknown {
  const parsed = structuralSchema.safeParse(draft);
  if (!parsed.success) return draft;
  return {
    ...parsed.data,
    sentences: parsed.data.sentences.map((sentence, index) => ({
      ...sentence,
      quiz: quizErrors(sentence, index, lines?.slice(sentence.start, sentence.end + 1)).length ? null : sentence.quiz,
    })),
  };
}

/** First-attempt advice only: prefer sentences of at most three lines. */
export function analysisAdvice(draft: unknown): string[] {
  const parsed = structuralSchema.safeParse(draft);
  if (!parsed.success) return [];
  return parsed.data.sentences.flatMap((sentence, index) => {
    const length = sentence.end - sentence.start + 1;
    return length > 3 ? [`Sentence ${index} has ${length} lines; prefer at most 3`] : [];
  });
}
