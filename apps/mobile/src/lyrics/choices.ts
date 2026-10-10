import { decoySentence, type Quiz } from '@kashi-koi/shared/analysis';
import type { Choice } from '@/types/domain';

/** Each gap choice changes one phrase and shares the same surrounding sentence. */
export function quizChoices(translation: string, quiz: Quiz): Choice[] {
  const start = translation.indexOf(quiz.phrase);
  const before = translation.slice(0, start);
  const after = translation.slice(start + quiz.phrase.length);
  const parts = (phrase: string): Choice['parts'] => [
    { text: before, marked: false },
    { text: phrase, marked: true },
    { text: after, marked: false },
  ];
  return [
    { text: translation, parts: parts(quiz.phrase), correct: true },
    ...quiz.decoys.map((decoy) => ({
      text: decoySentence(translation, quiz.phrase, decoy),
      parts: parts(decoy.phrase),
      correct: false,
      reason: decoy.reason,
    })),
  ];
}

/** Return a shared sentence gap only when every choice marks exactly one phrase. */
export function gapOf(choices: Choice[]): { before: string; after: string } | undefined {
  let gap: { before: string; after: string } | undefined;
  for (const choice of choices) {
    const marked = choice.parts.findIndex((part) => part.marked);
    if (marked < 0 || choice.parts.filter((part) => part.marked).length !== 1) return undefined;
    const before = choice.parts
      .slice(0, marked)
      .map((part) => part.text)
      .join('');
    const after = choice.parts
      .slice(marked + 1)
      .map((part) => part.text)
      .join('');
    if (gap && (gap.before !== before || gap.after !== after)) return undefined;
    gap = { before, after };
  }
  return gap;
}
