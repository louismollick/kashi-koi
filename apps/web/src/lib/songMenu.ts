import type { MouseEvent, PointerEvent } from 'react';
import { create } from 'zustand';

/** What the menu acts on. Up next rows pass their `position` so the song menu can offer removal. */
export type MenuTarget =
  | { kind: 'song'; id: string; position?: number }
  | { kind: 'album'; id: string }
  | { kind: 'artist'; id: string };

/** Where a desktop menu opens: the pointer, or the right edge of the button that opened it. Phones use a bottom sheet. */
export type MenuAnchor = { x: number; y: number; align: 'start' | 'end' };

export const menuStore = create<{ target: MenuTarget | null; anchor: MenuAnchor | null }>(() => ({
  target: null,
  anchor: null,
}));

export const openMenu = (target: MenuTarget, anchor: MenuAnchor | null = null) =>
  menuStore.setState({ target, anchor });
export const closeMenu = () => menuStore.setState({ target: null, anchor: null });

/** Right-click: replaces the browser menu with ours, at the pointer. */
export function openMenuAtPointer(event: MouseEvent | PointerEvent, target: MenuTarget) {
  event.preventDefault();
  event.stopPropagation();
  openMenu(target, { x: event.clientX, y: event.clientY, align: 'start' });
}

/** A "more" button or long press: the desktop popover hangs from the element's bottom right corner. */
export function openMenuFrom(element: Element, target: MenuTarget) {
  const rect = element.getBoundingClientRect();
  openMenu(target, { x: rect.right, y: rect.bottom + 4, align: 'end' });
}
