import { z } from 'zod';

const text = z.string().regex(/\S/, 'Must not be empty');
const lineIndex = z.number().int().nonnegative();
const decoySchema = z.strictObject({ from: text, to: text, reason: text });
const sentenceSchema = z.strictObject({
  start: lineIndex,
  end: lineIndex,
  translation: text,
  decoys: z.array(decoySchema),
});

export type Decoy = z.infer<typeof decoySchema>;

/** Replace only the first occurrence of the changed phrase, keeping replacement text literal. */
export function decoyText(translation: string, decoy: Decoy): string {
  const start = translation.indexOf(decoy.from);
  return start < 0
    ? translation
    : translation.slice(0, start) + decoy.to + translation.slice(start + decoy.from.length);
}

export const songAnalysisDraftSchema = z.strictObject({
  title: text,
  summary: text,
  speaker: text,
  addressee: text,
  lines: z.array(text),
  sentences: z.array(sentenceSchema),
});

export const songAnalysisSchema = songAnalysisDraftSchema.extend({
  sentences: z.array(sentenceSchema.refine((sentence) => !decoyErrors(sentence, 0).length, 'Invalid decoys')),
  schemaVersion: z.literal(2),
  fingerprint: text,
  model: text,
  createdAt: text,
});

/** Strict, required fields for OpenAI structured output; metadata is added later. */
export const songAnalysisDraftJsonSchema = z.toJSONSchema(songAnalysisDraftSchema);

export type SongAnalysisDraft = z.infer<typeof songAnalysisDraftSchema>;
export type SongAnalysis = z.infer<typeof songAnalysisSchema>;

/** Check model output and contiguous, inclusive sentence ranges against the input. */
export function validateAnalysis(draft: unknown, lineCount: number, requireDecoys = false): string[] {
  if (!Number.isInteger(lineCount) || lineCount < 0) return ['Input line count must be a non-negative integer'];
  const result = songAnalysisDraftSchema.safeParse(draft);
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
    errors.push(...decoyErrors(sentence, index, requireDecoys));
  });
  if (nextLine !== lineCount) errors.push(`Sentences must cover all ${lineCount} input lines`);
  return errors;
}

/** Validate optional stored decoys, or require two for a model's first attempt. */
export function decoyErrors(
  sentence: { translation: string; decoys: unknown },
  index: number,
  requireDecoys = false,
): string[] {
  const parsed = z.array(decoySchema).safeParse(sentence.decoys);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => `Sentence ${index} decoys ${issue.path.join('.')}: ${issue.message}`);
  const decoys = parsed.data;
  const errors: string[] = [];
  if (!requireDecoys && !decoys.length) return [];
  if (decoys.length !== 2) errors.push(`Sentence ${index} must have exactly 2 decoys`);
  const spans = decoys.map((decoy, decoyIndex) => {
    const start = sentence.translation.indexOf(decoy.from);
    if (start < 0 || decoy.from.length >= sentence.translation.length || decoy.from === decoy.to)
      errors.push(`Sentence ${index} decoy ${decoyIndex} must replace a shorter phrase with different text`);
    return { start, end: start + decoy.from.length };
  });
  const [first, second] = spans;
  if (
    first &&
    second &&
    first.start >= 0 &&
    second.start >= 0 &&
    !(first.start === second.start && first.end === second.end) &&
    first.start < second.end &&
    second.start < first.end
  )
    errors.push(`Sentence ${index} decoy spans must be identical or not overlap`);
  const texts = decoys.map((decoy) => decoyText(sentence.translation, decoy));
  if (texts.includes(sentence.translation) || new Set(texts).size !== texts.length)
    errors.push(`Sentence ${index} decoy translations must differ from the answer and each other`);
  // Reasons quote the Japanese form they explain; the choices themselves stay English.
  if (decoys.some((decoy) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(decoy.from + decoy.to)))
    errors.push(`Sentence ${index} decoy phrases must be English`);
  return errors;
}

const analysisWithoutDecoyChecks = songAnalysisDraftSchema.extend({
  sentences: z.array(sentenceSchema.extend({ decoys: z.unknown() })),
});

/** Preserve translations when quiz decoys are invalid, leaving structural errors for validation. */
export function dropInvalidDecoys(draft: unknown): unknown {
  const parsed = analysisWithoutDecoyChecks.safeParse(draft);
  if (!parsed.success) return draft;
  return {
    ...parsed.data,
    sentences: parsed.data.sentences.map((sentence, index) => ({
      ...sentence,
      decoys: decoyErrors(sentence, index).length ? [] : sentence.decoys,
    })),
  };
}
