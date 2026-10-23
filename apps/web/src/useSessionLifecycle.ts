import { setTranslationForeground, pauseTranslations } from '@kashi-koi/core/japanese/translate';
import { sessionStore } from '@kashi-koi/core/navidrome/session';
import { syncLibrary } from '@kashi-koi/core/navidrome/sync';
import { useEffect } from 'react';
import { setupTransport } from '@/platform/transport';

/**
 * What runs while someone is signed in, mirroring the session effect of apps/mobile/src/app/_layout.tsx: set up
 * the playback transport, sync the library (which then scans lyrics), keep translation work to the visible tab, and
 * undo all of it when the session ends. Phase 3 adds the Media Session handlers next to the transport.
 */
export function useSessionLifecycle() {
  const session = sessionStore((state) => state.session);
  useEffect(() => {
    if (!session) return;
    let dispose: (() => void) | undefined,
      cancelled = false;
    void setupTransport(() => !cancelled && sessionStore.getState().session === session).then((cleanup) => {
      if (cancelled) cleanup();
      else dispose = cleanup;
    });
    void setTranslationForeground(document.visibilityState === 'visible');
    void syncLibrary();
    const onVisibility = () => void setTranslationForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      dispose?.();
      void pauseTranslations();
    };
  }, [session]);
}
