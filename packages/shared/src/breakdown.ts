import { z } from 'zod';

const text = z.string().regex(/\S/, 'Must not be empty');
const step = z.strictObject({ japanese: text, reading: z.string(), english: text });

export const breakdownDraftSchema = z.strictObject({
  chunks: z.array(
    z.strictObject({ text, reading: z.string(), english: z.array(text), steps: z.array(step), note: z.string() }),
  ),
});
export const breakdownSchema = breakdownDraftSchema.extend({
  fingerprint: text,
  start: z.number().int().nonnegative(),
  model: text,
  createdAt: text,
});
export const breakdownDraftJsonSchema = z.toJSONSchema(breakdownDraftSchema);
export type Breakdown = z.infer<typeof breakdownSchema>;
export type BreakdownDraft = z.infer<typeof breakdownDraftSchema>;

/** Check chunk coverage and learner-sized steps against the sentence's source text. */
export function validateBreakdown(draft: unknown, sentenceText: string, translation: string): string[] {
  const result = breakdownDraftSchema.safeParse(draft);
  if (!result.success)
    return result.error.issues.map((issue) => `${issue.path.join('.') || 'Breakdown'}: ${issue.message}`);
  const { chunks } = result.data;
  const errors: string[] = [];
  if (!chunks.length) errors.push('Breakdown must have at least one chunk');
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/gu)
      ?.join('') ?? '';
  if (normalize(chunks.map((chunk) => chunk.text).join('')) !== normalize(sentenceText))
    errors.push('Chunk texts must cover the sentence in order');
  chunks.forEach((chunk, index) => {
    if (chunk.steps.length < 1 || chunk.steps.length > 4) errors.push(`Chunk ${index} must have 1 to 4 steps`);
    if (/[\p{Script=Han}々]/u.test(chunk.text) && !chunk.reading)
      errors.push(`Chunk ${index} needs a reading for kanji`);
    if (!/^[\p{Script=Hiragana}]*$/u.test(chunk.reading))
      errors.push(`Chunk ${index} reading must be hiragana or empty`);
    for (const piece of chunk.english)
      if (!translation.includes(piece))
        errors.push(`Chunk ${index} English ${JSON.stringify(piece)} must occur in the sentence translation`);
    chunk.steps.forEach((step, stepIndex) => {
      if (/[\p{Script=Han}々]/u.test(step.japanese) && !step.reading)
        errors.push(`Chunk ${index} step ${stepIndex} needs a reading for kanji`);
      if (!/^[\p{Script=Hiragana}]*$/u.test(step.reading))
        errors.push(`Chunk ${index} step ${stepIndex} reading must be hiragana or empty`);
    });
  });
  return errors;
}
