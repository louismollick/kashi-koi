import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { colors } from '@/constants/theme';
import { getLineText } from '@/store/libraryStore';
import { FuriganaLine } from './LineCard';
import { Label } from './ui';
import type { ReactNode } from 'react';
import type { Line } from '@/types/domain';

/** Plain lyric for listen mode and the edit drawer: white when current, gray otherwise. `marked` adds the in-review dot in the left gutter. */
export function LyricRow({ line, current, translations, marked = false }: { line: Line; current: boolean; translations: boolean; marked?: boolean }) {
  const color = current ? colors.text : colors.muted;
  return <View>
    {marked && <View style={{ position: 'absolute', left: -11, top: translations ? 21 : 10, width: 6, height: 6, backgroundColor: colors.coral }} />}
    {translations ? <FuriganaLine line={line} compact color={color} /> : <Label style={{ fontSize: 20, lineHeight: 26, color }}>{getLineText(line)}</Label>}
    {translations && line.translation && <Label style={{ marginTop: 2, color }}>{line.translation}</Label>}
  </View>;
}

/** Keeps the row at `index` in the middle of the viewport; half a viewport of padding lets the first and last rows reach it. */
export function CenteredList({ index, children }: { index: number; children: ReactNode[] }) {
  const scroll = useRef<ScrollView>(null);
  const rows = useRef<Record<number, { y: number; height: number }>>({});
  const [viewport, setViewport] = useState(0);
  const center = useCallback(() => {
    const row = rows.current[index];
    if (row && viewport) scroll.current?.scrollTo({ y: row.y + row.height / 2 - viewport / 2, animated: true });
  }, [index, viewport]);
  useEffect(center, [center]);
  return <ScrollView ref={scroll} onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout.height)} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: viewport / 2, gap: 18 }}>
    {children.map((child, i) => <View key={i} onLayout={({ nativeEvent }) => { rows.current[i] = nativeEvent.layout; if (i === index) center(); }}>{child}</View>)}
  </ScrollView>;
}
