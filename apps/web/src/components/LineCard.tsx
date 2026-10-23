import { colors } from '@kashi-koi/design/tokens';
import type { Line } from '@kashi-koi/core/types/domain';
import { RubyLine } from './RubyLine';

/**
 * The quiz sentence: every line, left-aligned so a clause split across lines reads as one thought. `current`
 * brightens the line being sung (-1 brightens all). Readings come from the lines' own segments.
 */
export function SentenceLines({ lines, current = -1 }: { lines: Line[]; current?: number }) {
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, index) => (
        <RubyLine
          // A sentence's lines have no identity beyond their position, and a chorus line can repeat.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional list
          key={index}
          compact
          size={22}
          line={line}
          color={current < 0 || index === current ? colors.text : colors.muted}
        />
      ))}
    </div>
  );
}
