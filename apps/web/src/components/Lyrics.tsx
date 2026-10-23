import { getLineText } from '@kashi-koi/core/store/libraryStore';
import type { Line } from '@kashi-koi/core/types/domain';
import { colors } from '@kashi-koi/design/tokens';
import { Children, memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RubyLine } from './RubyLine';
import { Label } from './ui';

/**
 * Plain lyric for listen mode: white when current, gray otherwise. `marked` adds the in-review dot in the left
 * gutter. `translation` renders below the line when given, so callers decide whether a translation belongs to this
 * line or to the sentence it ends. Memoized: it re-renders only when one of its props changes, so pass primitives and
 * stable objects.
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
    <span className="relative block">
      {marked && (
        <span aria-hidden className="absolute -left-[11px] size-1.5 bg-coral" style={{ top: furigana ? 21 : 10 }} />
      )}
      {furigana ? (
        <RubyLine line={line} compact color={color} />
      ) : (
        <Label className="block text-xl leading-[26px]" style={{ color }}>
          {getLineText(line)}
        </Label>
      )}
      {translation && (
        <Label className="mt-1 block" style={{ color }}>
          {translation}
        </Label>
      )}
    </span>
  );
});

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keeps the row at `index` in the middle of the viewport; half a viewport of padding lets the first and last rows
 * reach it. `gapBefore` tightens rows that continue a sentence; `header` sits above the rows without an index.
 * Memoize the rows themselves (see `LyricRow`) so a change of `index` re-renders only the rows that changed. Key it
 * by song so a new song starts at its own first row.
 */
export function CenteredList({
  index,
  children,
  gapBefore,
  header,
}: {
  index: number;
  children: ReactNode;
  gapBefore?: (index: number) => number;
  header?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);
  const settled = useRef(false);
  const latest = useRef(index);
  latest.current = index;
  const center = useCallback((animate: boolean) => {
    const box = scroller.current,
      row = box?.querySelector<HTMLElement>(`[data-row="${latest.current}"]`);
    if (!box || !row || !box.clientHeight) return;
    box.scrollTo({
      top: row.offsetTop + row.offsetHeight / 2 - box.clientHeight / 2,
      behavior: animate && !reducedMotion() ? 'smooth' : 'auto',
    });
  }, []);
  // Track the viewport (it sets the padding) and re-center when rows change height, e.g. when readings arrive.
  useLayoutEffect(() => {
    const box = scroller.current,
      inner = content.current;
    if (!box || !inner) return;
    setViewport(box.clientHeight);
    const observer = new ResizeObserver(() => {
      setViewport(box.clientHeight);
      center(false);
    });
    observer.observe(box);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [center]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the index and viewport are what re-center the list
  useEffect(() => {
    // The first placement jumps; later lines glide.
    center(settled.current);
    if (viewport) settled.current = true;
  }, [index, viewport, center]);
  return (
    <div ref={scroller} className="relative h-full overflow-y-auto overscroll-contain [scrollbar-width:none]">
      <div ref={content} className="px-[22px]" style={{ paddingBlock: viewport / 2 }}>
        {header && <div className="mb-7">{header}</div>}
        {Children.map(children, (child, i) => (
          <div data-row={i} style={{ marginTop: i === 0 ? 0 : (gapBefore?.(i) ?? 18) }}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
