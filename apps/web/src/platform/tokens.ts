import type { Token } from '@kashi-koi/core/japanese/translate';
import type { IpadicFeatures } from '@patdx/kuromoji';

/** Same kanji test as core's `alignReading`: Han characters plus the repeat marks 々 and 〆. */
const kanji = /[\p{Script=Han}々〆]/u;

/** IPADIC readings are katakana; furigana is hiragana. The long vowel mark stays as it is. */
const toHiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));

/**
 * Turn kuromoji's tokens for `text` into core's tokens, like the iOS tokenizer: a reading (hiragana) only for tokens
 * that contain kanji, none for unknown words, and surfaces that rebuild `text` exactly. Anything kuromoji does not
 * cover (it should not happen) ends up in a final reading-less token, so the surfaces always add up to `text`.
 */
export function toTokens(text: string, features: Pick<IpadicFeatures, 'surface_form' | 'reading' | 'word_type'>[]) {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const feature of features) {
    const surface = feature.surface_form;
    if (!surface || !text.startsWith(surface, cursor)) break;
    cursor += surface.length;
    const reading = feature.word_type === 'KNOWN' && kanji.test(surface) ? toHiragana(feature.reading ?? '') : '';
    // A reading that is not kana (kuromoji's "*" placeholder) is no reading.
    tokens.push(/^[ぁ-ゖー]+$/.test(reading) ? { surface, reading } : { surface });
  }
  if (cursor < text.length) tokens.push({ surface: text.slice(cursor) });
  return tokens;
}
