import { decoySentence, type Quiz } from '@kashi-koi/shared/analysis';
import { currentSentence, getLyrics } from '@/store/libraryStore';
import type { Choice, Song } from '@/types/domain';

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

/** Shuffle analyzed decoys or distinct same-song translations once when a sentence becomes current. */
export function getAnswers(song: Song, index: number, random = Math.random): Choice[] {
  const line = currentSentence(song.id, index)?.sentence;
  if (!line?.translation) return [];
  const choices = line.quiz ? quizChoices(line.translation, line.quiz) : undefined;
  const others = [
    ...new Set(
      getLyrics(song.id)
        .sentences.map((item) => item.translation)
        .filter((text): text is string => !!text && text !== line.translation),
    ),
  ];
  const shuffle = <T>(texts: T[]) => {
    for (let i = texts.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [texts[i], texts[j]] = [texts[j]!, texts[i]!];
    }
    return texts;
  };
  return shuffle(
    choices ??
      [line.translation, ...shuffle(others).slice(0, 2)].map((text) => ({
        text,
        parts: [{ text, marked: false }],
        correct: text === line.translation,
      })),
  );
}
