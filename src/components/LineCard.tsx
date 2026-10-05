import { View } from 'react-native';
import { PixelFrame } from './PixelFrame';
import { Label, Tag } from './ui';
import { colors } from '@/constants/theme';
import { getLineText } from '@/store/libraryStore';
import type { Line } from '@/types/domain';

/** Ruby stays together; every character reserves reading space on each wrapped row. */
export function FuriganaLine({ line, compact = false, furigana = true, color }: { line: Line; compact?: boolean; furigana?: boolean; color?: string }) {
  const segments = line.segments.flatMap(segment => furigana && segment.reading ? [segment] : Array.from(segment.text, text => ({ text, reading: undefined })));
  return <View accessible accessibilityLabel={getLineText(line)} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: compact ? 'flex-start' : 'center' }}>
    {segments.map((segment, index) => <View key={index} style={{ paddingTop: furigana ? 16 : 0 }}>
      {furigana && segment.reading && <Label style={{ position: 'absolute', top: 0, left: -12, right: -12, fontSize: 11, lineHeight: 16, textAlign: 'center', color: color ?? '#d9d6ea' }}>{segment.reading}</Label>}
      <Label style={{ fontSize: compact ? 20 : 27, lineHeight: compact ? 30 : 36, fontWeight: '500', color: color ?? colors.text }}>{segment.text}</Label>
    </View>)}
  </View>;
}

/** Current lines keep the shared frame; listen mode can show the translation below. */
export function LineCard({ line, isNew = false, furigana = true, translation = false }: { line: Line; isNew?: boolean; furigana?: boolean; translation?: boolean }) {
  return <View>
    <PixelFrame fill={colors.surface} border="#363a5e" contentStyle={{ paddingHorizontal: 16, paddingVertical: 18, minHeight: 136, justifyContent: 'center' }}>
      <FuriganaLine line={line} furigana={furigana} />
      {translation && line.translation && <Label muted style={{ marginTop: 8, textAlign: 'center' }}>{line.translation}</Label>}
    </PixelFrame>
    {isNew && <View style={{ position: 'absolute', top: -9, left: 12 }}><Tag>NEW</Tag></View>}
  </View>;
}
