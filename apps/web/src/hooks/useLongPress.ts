import { type MouseEvent, type PointerEvent, useRef } from 'react';

/** Touch holds this long (ms) without moving count as a long press. */
const HOLD_MS = 500;
/** Moving further than this (px) is a scroll or drag, not a hold. */
const SLOP = 10;

/**
 * Touch long-press for an element that also handles clicks. Spread `handlers` on it. The click that ends a long press
 * is swallowed (`onClickCapture`), and the native menu is suppressed so the app's own can take its place. Mouse and
 * pen use right-click instead, through `onContextMenu`, so only touch pointers start the timer.
 */
export function useLongPress(onLongPress: (target: HTMLElement, event: PointerEvent) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    origin = useRef({ x: 0, y: 0 }),
    fired = useRef(false);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      fired.current = false;
      if (event.pointerType !== 'touch') return;
      origin.current = { x: event.clientX, y: event.clientY };
      const target = event.currentTarget;
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress(target, event);
      }, HOLD_MS);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: (event: MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };
  return handlers;
}
