import { validateAnalysis } from '@kashi-koi/shared/analysis';

const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/** Keep shared range checks and reject source-script quotations before an analysis is stored. */
export function validateDraft(draft: unknown, lineCount: number): string[] {
  const errors = validateAnalysis(draft, lineCount);
  if (!errors.length && japanese.test(JSON.stringify(draft) ?? ''))
    errors.push('All analysis text must be English. Romanize Japanese words instead of quoting Japanese script.');
  return errors;
}
