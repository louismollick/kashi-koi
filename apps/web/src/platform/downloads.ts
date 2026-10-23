import type { setDownloadRuntime } from '@kashi-koi/core/downloads/queue';

/**
 * The web app has no downloads (Not in web v1), but core's boot (`loadLibrary`) and `logout` still run the downloads
 * queue. This runtime makes those calls succeed with nothing stored.
 */
export const noDownloads: Parameters<typeof setDownloadRuntime>[0] = {
  prepare: async () => ({ root: 'web', art: {} }),
  load: async () => ({}),
  exists: async () => false,
  clearFiles: async () => {},
  clear: async () => {},
  remove: async () => {},
  delete: async () => {},
  save: async () => {},
  saveMany: async () => {},
};
