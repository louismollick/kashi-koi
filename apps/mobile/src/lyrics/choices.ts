import { decoyText, type Decoy } from '@kashi-koi/shared/analysis';
import type { Choice } from '@/types/domain';

/** Mark every distinct changed span in all options, using offsets in the original translation. */
export function decoyChoices(translation: string, decoys: Decoy[]): Choice[] {
  const spans = decoys.map((decoy) => {
    const start = translation.indexOf(decoy.from);
    return { start, end: start + decoy.from.length };
  });
  const regions = spans
    .filter((span, index) => spans.findIndex((other) => other.start === span.start && other.end === span.end) === index)
    .sort((a, b) => a.start - b.start);
  const parts = (decoy?: Decoy): Choice['parts'] => {
    const result: Choice['parts'] = [];
    let cursor = 0;
    const changed = decoy ? translation.indexOf(decoy.from) : -1;
    for (const region of regions) {
      if (cursor < region.start) result.push({ text: translation.slice(cursor, region.start), marked: false });
      result.push({
        text: decoy && changed === region.start ? decoy.to : translation.slice(region.start, region.end),
        marked: true,
      });
      cursor = region.end;
    }
    if (cursor < translation.length) result.push({ text: translation.slice(cursor), marked: false });
    return result;
  };
  return [
    { text: translation, parts: parts(), correct: true },
    ...decoys.map((decoy) => ({
      text: decoyText(translation, decoy),
      parts: parts(decoy),
      correct: false,
      reason: decoy.reason,
    })),
  ];
}
