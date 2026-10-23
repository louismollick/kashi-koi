import type { DownloadTarget } from '@kashi-koi/core/downloads';

/** Download sheet targets: one album or artist, never the whole library. */
export type SheetTarget = Exclude<DownloadTarget, { kind: 'library' }>;

/** Route to the song menu, for long presses and ⋯ buttons. Up next rows pass their `position` to offer removal. */
export const songMenu = (id: string, position?: number) => ({
  pathname: '/song-menu' as const,
  params: position === undefined ? { id } : { id, position: String(position) },
});

/** Route to the download sheet, used by long presses and the page buttons. */
export const downloadSheet = (target: SheetTarget) => ({ pathname: '/download' as const, params: target });
