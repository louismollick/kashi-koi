import { colors } from '@kashi-koi/design/tokens';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { Label } from './ui';

/** m:ss for a position in milliseconds. */
export const time = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Pointer positions map from this inset on each side, so dragging past either end reaches the start or end. */
const INSET = 16;
/** Arrow keys on the focused scrubber step this far. */
const KEY_STEP_MS = 10000;

/**
 * Full-width coral progress line. With `onSeek` a 28px band scrubs the song: click or drag (pointer events), with the
 * time floating above the drag point and the line growing 2px, or step with the arrow keys. Releasing seeks; the line
 * follows `progress` again once the store catches up. Without `onSeek` it only displays.
 */
export function ProgressLine({
  progress,
  total = 0,
  onSeek,
  height = 4,
  track = colors.track,
}: {
  progress: number;
  total?: number;
  onSeek?: (ms: number) => void;
  height?: number;
  track?: string;
}) {
  const band = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ value: number; x: number } | null>(null);
  // The latest drag for pointerup, which would otherwise read the render before the last move.
  const latest = useRef(drag);
  const value = Math.min(1, Math.max(0, drag?.value ?? progress));
  const line = (
    <span className="block" style={{ height: drag ? height + 2 : height, background: track }}>
      <span className="block h-full" style={{ width: `${value * 100}%`, background: colors.coral }} />
    </span>
  );
  if (!onSeek) return line;
  const at = (event: PointerEvent) => {
    const rect = band.current!.getBoundingClientRect(),
      span = Math.max(1, rect.width - INSET * 2);
    const x = event.clientX - rect.left;
    return { value: Math.min(1, Math.max(0, (x - INSET) / span)), x };
  };
  const update = (next: { value: number; x: number } | null) => {
    latest.current = next;
    setDrag(next);
  };
  const step = (event: KeyboardEvent) => {
    const to = { ArrowLeft: value * total - KEY_STEP_MS, ArrowRight: value * total + KEY_STEP_MS, Home: 0, End: total }[
      event.key
    ];
    if (to === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onSeek(Math.min(total, Math.max(0, to)));
  };
  return (
    <div
      ref={band}
      role="slider"
      tabIndex={0}
      aria-label="Song position"
      aria-valuemin={0}
      aria-valuemax={Math.round(total / 1000)}
      aria-valuenow={Math.round((value * total) / 1000)}
      aria-valuetext={time(value * total)}
      onKeyDown={step}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        update(at(event));
      }}
      onPointerMove={(event) => {
        if (latest.current) update(at(event));
      }}
      onPointerUp={() => {
        if (latest.current) onSeek(latest.current.value * total);
        update(null);
      }}
      onPointerCancel={() => update(null)}
      className="relative -mt-3 flex h-7 cursor-pointer touch-none flex-col justify-center select-none"
    >
      {line}
      {drag && (
        <Label
          className="pointer-events-none absolute bottom-[26px] w-12 text-center text-[13px] font-bold tabular-nums"
          style={{ left: Math.max(8, drag.x - 24) }}
        >
          {time(drag.value * total)}
        </Label>
      )}
    </div>
  );
}
