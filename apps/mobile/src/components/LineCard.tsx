import { View } from 'react-native';
import { PixelFrame } from './PixelFrame';
import { Label, Tag } from './ui';
import { colors } from '@/constants/theme';
import { getLineText } from '@/store/libraryStore';
import type { Line } from '@/types/domain';

/**
 * Ruby stays together; every character reserves reading space on each wrapped row. `size` overrides the font
 * size. Characters from `highlightFrom` on (a ruby run counts if it reaches past it) take `highlightColor`, which
 * the explain sheet uses to show what a step added.
 */
export function FuriganaLine({
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
  const ends = segments.reduce<number[]>((all, segment) => [...all, (all.at(-1) ?? 0) + segment.text.length], []);
  const size = fontSize ?? (compact ? 20 : 27);
  return (
    <View
      accessible
      accessibilityLabel={getLineText(line)}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: furigana ? 2 : 0,
        justifyContent: compact ? 'flex-start' : 'center',
      }}
    >
      {segments.map((segment, index) => {
        const highlighted = highlightFrom !== undefined && ends[index]! > highlightFrom;
        return (
          <View key={index} style={{ paddingTop: furigana ? 12 : 0 }}>
            {furigana && segment.reading && (
              <Label
                style={{
                  position: 'absolute',
                  top: 0,
                  left: -12,
                  right: -12,
                  fontSize: 10,
                  lineHeight: 12,
                  textAlign: 'center',
                  color: color ?? '#d9d6ea',
                }}
              >
                {segment.reading}
              </Label>
            )}
            <Label
              style={{
                fontSize: size,
                lineHeight: Math.round(size * 1.3),
                fontWeight: highlighted ? '700' : '500',
                color: highlighted ? highlightColor : (color ?? colors.text),
              }}
            >
              {segment.text}
            </Label>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The quiz card: every line of the current sentence, left-aligned so a clause split across lines reads as one
 * thought. `current` brightens the line being sung (-1 brightens all).
 */
export function SentenceCard({
  lines,
  current = -1,
  isNew = false,
}: {
  lines: Line[];
  current?: number;
  isNew?: boolean;
}) {
  return (
    <View>
      <PixelFrame
        fill={colors.surface}
        border="#363a5e"
        contentStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 4 }}
      >
        {lines.map((line, index) => (
          <FuriganaLine
            key={index}
            compact
            size={22}
            line={line}
            color={current < 0 || index === current ? colors.text : colors.muted}
          />
        ))}
      </PixelFrame>
      {isNew && (
        <View style={{ position: 'absolute', top: -9, left: 12 }}>
          <Tag>NEW</Tag>
        </View>
      )}
    </View>
  );
}
