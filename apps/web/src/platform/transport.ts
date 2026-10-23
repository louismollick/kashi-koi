import { appStore, setTransport } from '@kashi-koi/core/store/appStore';

/**
 * Phase 3 extension point: install the `<audio>` transport for the signed-in session and return its cleanup. This
 * mirrors the iOS `setupTransport`; `isCurrent` turns false once the session changes, so late setup can bail out.
 * Until then, playing reports an error instead of silently doing nothing.
 */
export async function setupTransport(_isCurrent: () => boolean): Promise<() => void> {
  const fail = () =>
    appStore.setState({ playbackError: 'Playback is not available in the web app yet', playing: false });
  return setTransport({ load: fail, play: fail, pause() {}, seek() {} });
}
