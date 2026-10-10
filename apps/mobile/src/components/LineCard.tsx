import { View } from 'react-native';
import { PixelFrame } from './PixelFrame';
import { Label, Tag } from './ui';
import { colors } from '@/constants/theme';
import { getLineText } from '@/store/libraryStore';
import type { Line } from '@/types/domain';

/** Ruby stays together; every character reserves reading space on each wrapped row. `size` overrides the font size. */
export function FuriganaLine({
  line,
  compact = false,
  furigana = true,
  color,
  size: fontSize,
}: {
  line: Line;
  compact?: boolean;
  furigana?: boolean;
  color?: string;
  size?: number;
}) {
  const segments = line.segments.flatMap((segment) =>
    furigana && segment.reading ? [segment] : Array.from(segment.text, (text) => ({ text, reading: undefined })),
  );
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
      {segments.map((segment, index) => (
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
              fontWeight: '500',
              color: color ?? colors.text,
            }}
          >
            {segment.text}
          </Label>
        </View>
      ))}
    </View>
  );
}

/**
 * The quiz card: every line of the current sentence, so a clause split across lines reads as one thought.
 * `current` brightens the line being sung (-1 brightens all). The previous sentence sits dimmed above for context.
 */
export function SentenceCard({
  lines,
  current = -1,
  previous,
  isNew = false,
}: {
  lines: Line[];
  current?: number;
  previous?: Line[];
  isNew?: boolean;
}) {
  return (
    <View>
      {previous && (
        <Label muted numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, marginBottom: 8, textAlign: 'center' }}>
          {previous.map(getLineText).join(' ')}
        </Label>
      )}
      <View>
        <PixelFrame
          fill={colors.surface}
          border="#363a5e"
          contentStyle={{
            paddingHorizontal: 16,
            paddingVertical: 18,
            minHeight: 136,
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {lines.map((line, index) => (
            <FuriganaLine
              key={index}
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
    </View>
  );
}
