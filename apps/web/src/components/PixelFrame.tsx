import { steppedPolygon, tint } from '@kashi-koi/design/shape';
import { type CSSProperties, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type Steps = 2 | 3;
const polygons: Record<Steps, string> = { 2: steppedPolygon(2, 2), 3: steppedPolygon(3, 2) };
/** Boxes of 36px or more in both directions get three pixel steps per corner, smaller ones two. */
const stepsFor = (width: number, height: number): Steps => (Math.min(width, height) >= 36 ? 3 : 2);

// One observer for every frame on the page; each element registers the callback that takes its new step count.
const listeners = new WeakMap<Element, (steps: Steps) => void>();
const observer =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.borderBoxSize[0];
          if (box) listeners.get(entry.target)?.(stepsFor(box.inlineSize, box.blockSize));
        }
      });

/** The corner step count of a frame, from its size. Skipped (always `fixed`) when the caller knows the size. */
function useSteps(ref: RefObject<HTMLElement | null>, fixed: Steps | undefined) {
  const [measured, setMeasured] = useState<Steps>(2);
  useLayoutEffect(() => {
    const element = ref.current;
    if (fixed || !element || !observer) return;
    // Measure before paint so the first frame already has the right corners.
    setMeasured(stepsFor(element.offsetWidth, element.offsetHeight));
    listeners.set(element, setMeasured);
    observer.observe(element);
    return () => {
      observer.unobserve(element);
      listeners.delete(element);
    };
  }, [ref, fixed]);
  return fixed ?? measured;
}

/**
 * Shared pixel-cornered shape for every button, card, tag and cover; the same shape as the iOS PixelFrame.
 * A bottom layer filled with the border color and a layer inset 2px filled with `fill` are both clipped to the
 * stepped polygon, so the border follows each step like iOS's 2pt stroke. The outline defaults to a lighter tint of
 * the fill; pass `border={null}` to hide it. `className`/`style` go on the outer box, `contentClassName`/
 * `contentStyle` on the box that holds the children (iOS `style`/`contentStyle`). Pass `steps` when the size is
 * known; otherwise it is measured with a ResizeObserver.
 */
export function PixelFrame({
  children,
  fill,
  border,
  steps,
  className,
  style,
  contentClassName,
  contentStyle,
}: {
  children?: ReactNode;
  fill: string;
  border?: string | null;
  steps?: Steps;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const clipPath = polygons[useSteps(ref, steps)];
  const stroke = border === undefined ? tint(fill, 0.22) : border;
  const layer = 'pointer-events-none absolute';
  return (
    <span ref={ref} className={cn('relative block', className)} style={style}>
      {stroke ? (
        <>
          <span aria-hidden className={cn(layer, 'inset-0')} style={{ background: stroke, clipPath }} />
          <span aria-hidden className={cn(layer, 'inset-[2px]')} style={{ background: fill, clipPath }} />
        </>
      ) : (
        <span aria-hidden className={cn(layer, 'inset-0')} style={{ background: fill, clipPath }} />
      )}
      <span className={cn('relative block', contentClassName)} style={contentStyle}>
        {children}
      </span>
    </span>
  );
}
