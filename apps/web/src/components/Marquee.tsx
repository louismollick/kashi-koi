import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/** Overflowing titles scroll at 30px per second, resting 2 seconds at each end. */
const speed = 30;
const rest = 2;

/** One line of text, scrolling when it overflows. */
export function Marquee({ children, className }: { children: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null),
    text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const outer = box.current,
      inner = text.current;
    if (!outer || !inner || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let animation: Animation | undefined;
    const start = () => {
      animation?.cancel();
      animation = undefined;
      const overflow = inner.scrollWidth - outer.clientWidth;
      if (overflow <= 1) return;
      // Rest, scroll to the end, rest, then jump back to the start as the loop repeats.
      const scroll = overflow / speed,
        total = scroll + rest * 2,
        end = `translateX(-${overflow}px)`;
      animation = inner.animate(
        [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: rest / total },
          { transform: end, offset: (rest + scroll) / total },
          { transform: end, offset: 1 },
        ],
        { duration: total * 1000, iterations: Number.POSITIVE_INFINITY, easing: 'linear' },
      );
    };
    start();
    // The text's own box changes with its content, so this also restarts when the title does.
    const observer = new ResizeObserver(start);
    observer.observe(outer);
    observer.observe(inner);
    return () => {
      observer.disconnect();
      animation?.cancel();
    };
  }, []);
  return (
    <span ref={box} className={cn('label block overflow-hidden whitespace-nowrap', className)}>
      <span ref={text} className="inline-block">
        {children}
      </span>
    </span>
  );
}
