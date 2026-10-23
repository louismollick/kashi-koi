import { setDefaultAnalysisServer } from '@kashi-koi/core/analysis/fetcher';
import { setDownloadRuntime } from '@kashi-koi/core/downloads/queue';
import { setTranslator } from '@kashi-koi/core/japanese/translate';
import { setLibraryDb } from '@kashi-koi/core/navidrome/libraryDb';
import { setSecrets } from '@kashi-koi/core/navidrome/secrets';
import { loadSession, sessionStore } from '@kashi-koi/core/navidrome/session';
import { loadLibrary } from '@kashi-koi/core/navidrome/sync';
import { hydrateAppState } from '@kashi-koi/core/store/appStore';
import { hydrateSettings } from '@kashi-koi/core/store/settingsStore';
import { webLibraryDb } from '@/platform/db';
import { noDownloads } from '@/platform/downloads';
import { webSecrets } from '@/platform/secrets';
import { localState } from '@/platform/storage';
import { webTranslator } from '@/platform/translator';

// Install the platform pieces core calls through: library database, secret storage, translator, downloads. This is
// the web counterpart of the top of apps/mobile/src/app/_layout.tsx.
setLibraryDb(webLibraryDb);
setSecrets(webSecrets);
setDefaultAnalysisServer(import.meta.env.VITE_KASHI_SERVER_URL);
setTranslator(webTranslator);
setDownloadRuntime(noDownloads);

// The service worker only exists in production builds. Preview shares dev's origin, so drop a leftover one rather
// than let it serve a stale build over the dev server.
if (import.meta.env.DEV) {
  void navigator.serviceWorker
    ?.getRegistrations()
    .then((all) => all.forEach((registration) => void registration.unregister()));
}

let booted: Promise<void> | undefined;

/**
 * Load everything the app starts from, in the order the iOS root layout does: settings first (it seeds itself from the
 * learning blob before that store rewrites it), then learning state, the cached library, and the saved session. The
 * app renders nothing until `sessionStore.ready`.
 */
export function boot() {
  booted ??= hydrateSettings(localState)
    .then(() => hydrateAppState(localState))
    .then(loadLibrary)
    .then(loadSession)
    .catch(() => {
      sessionStore.setState({ ready: true, error: 'Could not load the library' });
    });
  return booted;
}
