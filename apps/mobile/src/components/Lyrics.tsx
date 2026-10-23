import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { colors } from '@/constants/theme';
import { getLineText } from '@kashi-koi/core/store/libraryStore';
import { FuriganaLine } from './LineCard';
import { Label } from './ui';
import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { Line } from '@kashi-koi/core/types/domain';

/**
 * Plain lyric for listen mode and the edit drawer: white when current, gray otherwise. `marked` adds the
 * in-review dot in the left gutter. `translation` renders below the line when given, so callers decide whether
 * a translation belongs to this line or to the sentence it ends. Memoized: it re-renders only when one of its
 * props changes, so pass primitives and stable objects.
 */
export const LyricRow = memo(function LyricRow({
  line,
  current,
  furigana,
  translation,
  marked = false,
}: {
  line: Line;
  current: boolean;
  furigana: boolean;
  translation?: string;
  marked?: boolean;
}) {
  const color = current ? colors.text : colors.muted;
  return (
    <View>
      {marked && (
        <View
          style={{
            position: 'absolute',
            left: -11,
            top: furigana ? 21 : 10,
            width: 6,
            height: 6,
            backgroundColor: colors.coral,
          }}
        />
      )}
      {furigana ? (
        <FuriganaLine line={line} compact color={color} />
      ) : (
        <Label style={{ fontSize: 20, lineHeight: 26, color }}>{getLineText(line)}</Label>
      )}
      {translation && <Label style={{ marginTop: 4, color }}>{translation}</Label>}
    </View>
  );
});

/** One row's wrapper in `CenteredList`. `onRowLayout` is stable, so a row never gets a fresh onLayout closure. */
function Slot({
  index,
  gap,
  onRowLayout,
  children,
}: {
  index: number;
  gap: number;
  onRowLayout: (index: number, layout: LayoutChangeEvent['nativeEvent']['layout']) => void;
  children: ReactNode;
}) {
  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => onRowLayout(index, nativeEvent.layout),
    [index, onRowLayout],
  );
  return (
    <View style={{ marginTop: gap }} onLayout={onLayout}>
      {children}
    </View>
  );
}

/**
 * Keeps the row at `index` in the middle of the viewport; half a viewport of padding lets the first and last rows
 * reach it. `gapBefore` tightens rows that continue a sentence; `header` sits above the rows without an index.
 * Memoize the rows themselves (see `LyricRow`) so a change of `index` re-renders only the rows that changed.
 */
export function CenteredList({
  index,
  children,
  gapBefore,
  header,
}: {
  index: number;
  children: ReactNode[];
  gapBefore?: (index: number) => number;
  header?: ReactNode;
}) {
  const scroll = useRef<ScrollView>(null);
  const rows = useRef<Record<number, { y: number; height: number }>>({});
  const [viewport, setViewport] = useState(0);
  // Read by the stable layout callback, which would otherwise see a stale index or viewport.
  const latest = useRef({ index, viewport });
  const center = useCallback(() => {
    const { index, viewport } = latest.current;
    const row = rows.current[index];
    if (row && viewport) scroll.current?.scrollTo({ y: row.y + row.height / 2 - viewport / 2, animated: true });
  }, []);
  const onRowLayout = useCallback(
    (row: number, layout: { y: number; height: number }) => {
      rows.current[row] = layout;
      if (row === latest.current.index) center();
    },
    [center],
  );
  useEffect(() => {
    latest.current = { index, viewport };
    center();
  }, [index, viewport, center]);
  return (
    <ScrollView
      ref={scroll}
      onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout.height)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: viewport / 2 }}
    >
      {header && <View style={{ marginBottom: 28 }}>{header}</View>}
      {children.map((child, i) => (
        <Slot key={i} index={i} gap={i === 0 ? 0 : (gapBefore?.(i) ?? 18)} onRowLayout={onRowLayout}>
          {child}
        </Slot>
      ))}
    </ScrollView>
  );
}
