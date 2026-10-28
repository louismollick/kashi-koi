import { getLineText } from '@kashi-koi/core/store/libraryStore';
import type { Line } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { Label } from './ui';

/**
 * A lyric line with furigana as `<ruby>`: readings at 10px over 12px of space above the text, centered over their
 * kanji. A reading wider than its kanji widens the run instead of overhanging, so neighbouring readings never collide
 * or spill past the line's edges (the iOS `FuriganaLine`). Without `furigana` the line is plain text. Runs are
 * inline-blocks with the reading stacked above, never flex or block boxes: Yomitan reads those as line breaks (and
 * skips `<rt>`), so a hover lookup would stop after one run. Characters from `highlightFrom` on (a ruby run counts if
 * it reaches past it) take `highlightColor`, which the breakdown uses to show what a step added. `compact` left-aligns
 * and shrinks the default size.
 */
export function RubyLine({
  line,
  compact = false,
  furigana = true,
  color,
  size: fontSize,
  highlightFrom,
  highlightColor = colors.combo,
}: {
  line: Line;
  compact?: boolean;
  furigana?: boolean;
  color?: string;
  size?: number;
  highlightFrom?: number;
  highlightColor?: string;
}) {
  const segments = line.segments.flatMap((segment) =>
    furigana && segment.reading ? [segment] : Array.from(segment.text, (text) => ({ text, reading: undefined })),
  );
  let total = 0;
  const ends = segments.map((segment) => (total += segment.text.length));
  const size = fontSize ?? (compact ? 20 : 27);
  return (
    <span className="block">
      <span className="sr-only">{getLineText(line)}</span>
      {/* Each run's 2px bottom margin is the gap between wrapped rows; the negative margin takes it back off the last. */}
      <span
        aria-hidden
        className="block leading-none"
        style={{ textAlign: compact ? 'left' : 'center', marginBottom: furigana ? -2 : 0 }}
      >
        {segments.map((segment, index) => {
          const highlighted = highlightFrom !== undefined && ends[index]! > highlightFrom;
          return (
            <ruby
              // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder
              key={index}
              className="inline-block text-center"
              style={{ paddingTop: furigana && !segment.reading ? 12 : 0, marginBottom: furigana ? 2 : 0 }}
            >
              {furigana && segment.reading && (
                <rt
                  className="block text-center text-[10px] leading-3 whitespace-nowrap"
                  style={{ color: color ?? '#d9d6ea' }}
                >
                  {segment.reading}
                </rt>
              )}
              <Label
                className={highlighted ? 'font-bold' : 'font-medium'}
                style={{
                  fontSize: size,
                  lineHeight: `${Math.round(size * 1.3)}px`,
                  color: highlighted ? highlightColor : (color ?? colors.text),
                }}
              >
                {segment.text}
              </Label>
            </ruby>
          );
        })}
      </span>
    </span>
  );
}
