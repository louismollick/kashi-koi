import { validateAnalysis } from '@kashi-koi/shared/analysis';

const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/**
 * Keep shared range checks and reject source-script quotations before an analysis is stored. Decoy reasons are
 * exempt: they quote the Japanese word or ending that rules a decoy out.
 */
export function validateDraft(draft: unknown, lineCount: number, requireDecoys = true): string[] {
  const errors = validateAnalysis(draft, lineCount, requireDecoys);
  if (japanese.test(JSON.stringify(draft, (key, value) => (key === 'reason' ? undefined : value)) ?? ''))
    errors.push('All analysis text must be English. Romanize Japanese words instead of quoting Japanese script.');
  return errors;
}
