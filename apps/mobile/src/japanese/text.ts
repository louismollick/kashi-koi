import type { Line } from '@/types/domain';

const kanji = /[\p{Script=Han}々〆]/u;
/** Repeat marks alone are not Japanese lyrics, even when Unicode assigns them Han script. */
export const isJapanese = (text: string) =>
  /(?![ー々〆])[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
const hiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));

/** Attach readings to kanji runs, keeping matching kana outside the furigana. */
export function alignReading(surface: string, reading?: string): Line['segments'] {
  if (!reading || !kanji.test(surface)) return [{ text: surface }];
  const runs = surface.match(/[\p{Script=Han}々〆]+|[^\p{Script=Han}々〆]+/gu)!;
  function match(index: number, offset: number): Line['segments'] | null {
    if (index === runs.length) return offset === reading!.length ? [] : null;
    const text = runs[index]!;
    if (!kanji.test(text)) {
      const kana = hiragana(text);
      const rest = reading!.startsWith(kana, offset) ? match(index + 1, offset + kana.length) : null;
      return rest ? [{ text }, ...rest] : null;
    }
    for (let end = offset + 1; end <= reading!.length; end++) {
      const rest = match(index + 1, end);
      if (rest) return [{ text, reading: reading!.slice(offset, end) }, ...rest];
    }
    return null;
  }
  return match(0, 0) ?? [{ text: surface, reading }];
}
