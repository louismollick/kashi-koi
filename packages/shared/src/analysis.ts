import { z } from 'zod';

const text = z.string().regex(/\S/, 'Must not be empty');
const lineIndex = z.number().int().nonnegative();

export const songAnalysisDraftSchema = z.strictObject({
  title: text,
  summary: text,
  speaker: text,
  addressee: text,
  lines: z.array(text),
  sentences: z.array(z.strictObject({ start: lineIndex, end: lineIndex, translation: text })),
  notes: z.array(z.strictObject({ line: lineIndex, text })),
});

export const songAnalysisSchema = songAnalysisDraftSchema.extend({
  schemaVersion: z.literal(1),
  fingerprint: text,
  model: text,
  createdAt: text,
});

/** Strict, required fields for OpenAI structured output; metadata is added later. */
export const songAnalysisDraftJsonSchema = z.toJSONSchema(songAnalysisDraftSchema);

export type SongAnalysisDraft = z.infer<typeof songAnalysisDraftSchema>;
export type SongAnalysis = z.infer<typeof songAnalysisSchema>;

/** Check model output and contiguous, inclusive sentence ranges against the input. */
export function validateAnalysis(draft: unknown, lineCount: number): string[] {
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
  });
  if (nextLine !== lineCount) errors.push(`Sentences must cover all ${lineCount} input lines`);
  analysis.notes.forEach((note, index) => {
    if (note.line >= lineCount) errors.push(`Note ${index} refers to line ${note.line}, outside the input line range`);
  });
  return errors;
}
