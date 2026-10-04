import { View } from 'react-native';
import { PixelFrame } from './PixelFrame';
import { Label, Tag } from './ui';
import { colors } from '@/constants/theme';
import { getLineText } from '@/data/fakeData';
import type { Line } from '@/types/domain';

/** Ruby belongs to its kanji; phrases wrap at spaces, long phrases between characters. */
export function LineCard({ line, isNew = false }: { line: Line; isNew?: boolean }) {
  const phrases: Line['segments'][] = [[]];
  for (const segment of line.segments) {
    if (segment.reading) phrases[phrases.length - 1]!.push(segment);
    else segment.text.split(' ').forEach((text, index) => {
      if (index > 0) phrases.push([]);
      phrases[phrases.length - 1]!.push(...Array.from(text, character => ({ text: character })));
    });
  }
  return <View>
    <PixelFrame fill={colors.surface} border="#363a5e" contentStyle={{ paddingHorizontal: 16, paddingVertical: 18, minHeight: 136, justifyContent: 'center' }}>
    <View accessible accessibilityLabel={getLineText(line)} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8 }}>
      {phrases.map((segments, phraseIndex) => <View key={phraseIndex} style={{ maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {segments.map((segment, index) => <View key={index} style={{ paddingTop: 16 }}>
          {segment.reading && <Label style={{ position: 'absolute', top: 0, left: -12, right: -12, fontSize: 11, lineHeight: 16, textAlign: 'center', color: '#d9d6ea' }}>{segment.reading}</Label>}
          <Label style={{ fontSize: 27, lineHeight: 36, fontWeight: '500' }}>{segment.text}</Label>
      </View>)}
      </View>)}
    </View>
  </PixelFrame>
    {isNew && <View style={{ position: 'absolute', top: -9, left: 12 }}><Tag>NEW</Tag></View>}
  </View>;
}
