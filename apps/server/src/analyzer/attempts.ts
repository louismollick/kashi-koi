import { analysisAdvice, dropInvalidQuizzes, validateQuizzes } from '@kashi-koi/shared/analysis';
import type { Analyzer, AnalyzerInput } from './index.ts';
import { validateDraft } from './validate.ts';

/** `errors` is empty for a draft that can be stored. `advice` and `dropped` are for reporting only. */
export type AnalysisResult = { draft: unknown; errors: string[]; advice: string[]; dropped: string[] };

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
  if (!errors.length && !advice.length) return { draft: first, errors, advice, dropped: [] };
  const fallback = { draft: first, errors, advice, dropped: [] };

  let retry: AnalysisResult;
  try {
    const raw = await analyzer.analyze({ ...request, feedback: [...errors, ...advice] });
    const draft = dropInvalidQuizzes(raw, lines);
    retry = { draft, errors: validateDraft(draft, lines.length, lines), advice, dropped: validateQuizzes(raw, lines) };
  } catch (error) {
    if (errors.length) throw error;
    return fallback;
  }
  return retry.errors.length && !errors.length ? fallback : retry;
}
