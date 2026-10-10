import { validateAnalysis, validateQuizzes } from '@kashi-koi/shared/analysis';

const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/** Reject structural and quiz errors. Reasons may quote Japanese; quiz phrases have their own checks. */
export function validateDraft(draft: unknown, lineCount: number, lines?: string[]): string[] {
  const errors = [...validateAnalysis(draft, lineCount), ...validateQuizzes(draft, lines)];
  if (
    japanese.test(JSON.stringify(draft, (key, value) => (key === 'reason' || key === 'quiz' ? undefined : value)) ?? '')
  )
    errors.push('All analysis text must be English. Romanize Japanese words instead of quoting Japanese script.');
  return errors;
}
