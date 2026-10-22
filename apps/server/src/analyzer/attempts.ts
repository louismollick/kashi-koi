import { analysisAdvice, dropInvalidQuizzes, validateQuizzes } from '@kashi-koi/shared/analysis';
import { type Analyzer, type AnalyzerInput, UsageLimitError } from './index.ts';
import { validateDraft } from './validate.ts';

/**
 * `errors` is empty for a draft that can be stored. `advice` and `dropped` are for reporting only.
 * `limited` means the retry hit a usage limit and the valid first draft was kept, so callers should still pause.
 */
export type AnalysisResult = {
  draft: unknown;
  errors: string[];
  advice: string[];
  dropped: string[];
  limited: boolean;
};

/**
 * Ask for an analysis, retrying once with feedback when the first draft has errors or advice.
 * The retry drops quizzes that still fail, since the translations are worth keeping. A first draft
 * without errors is kept as the fallback, so a bad or failed retry never loses a valid analysis.
 * Throws if the first call fails, or the retry fails while the first draft has errors.
 */
export async function analyzeWithRetry(
  analyzer: Analyzer,
  request: Omit<AnalyzerInput, 'feedback'>,
): Promise<AnalysisResult> {
  const { lines } = request;
  const first = await analyzer.analyze(request);
  const errors = validateDraft(first, lines.length, lines);
  const advice = analysisAdvice(first);
  if (!errors.length && !advice.length) return { draft: first, errors, advice, dropped: [], limited: false };
  const fallback = { draft: first, errors, advice, dropped: [], limited: false };

  let retry: AnalysisResult;
  try {
    const raw = await analyzer.analyze({ ...request, feedback: [...errors, ...advice] });
    const draft = dropInvalidQuizzes(raw, lines);
    retry = {
      draft,
      errors: validateDraft(draft, lines.length, lines),
      advice,
      dropped: validateQuizzes(raw, lines),
      limited: false,
    };
  } catch (error) {
    if (errors.length) throw error;
    return { ...fallback, limited: error instanceof UsageLimitError };
  }
  return retry.errors.length && !errors.length ? fallback : retry;
}
