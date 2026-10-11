import { create } from 'zustand';

export type DownloadTarget = { kind: 'song' | 'album' | 'artist'; id: string } | { kind: 'library' };
export type DownloadEntry = {
  status: 'queued' | 'downloading' | 'done' | 'failed';
  fileName?: string;
  bytes?: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
};
export type DownloadEntries = Record<string, DownloadEntry>;
export type DownloadProgress = { completed: number; total: number };
export type DownloadArt = Record<string, { fileName: string; bytes: number }>;

/** SQLite owns durable song state; the directory inventory owns shared artwork. */
export const downloadStore = create<{
  entries: DownloadEntries;
  art: DownloadArt;
  root: string | null;
  progress: DownloadProgress | null;
}>(() => ({ entries: {}, art: {}, root: null, progress: null }));

export const isDownloaded = (songId: string) => downloadStore.getState().entries[songId]?.status === 'done';

/** Resolve relative names against today's document directory, including after an iOS restore. */
export function localAudioUri(songId: string) {
  const { entries, root } = downloadStore.getState(),
    entry = entries[songId];
  return root && entry?.status === 'done' && entry.fileName ? `${root}/audio/${entry.fileName}` : undefined;
}

export function localArtUri(coverArtId: string) {
  const { art, root } = downloadStore.getState(),
    entry = art[coverArtId];
  return root && entry ? `${root}/art/${entry.fileName}` : undefined;
}
