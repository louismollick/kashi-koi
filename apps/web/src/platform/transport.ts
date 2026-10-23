import { type Clock, installWebTransport, type SessionLike } from './webTransport';

const browserClock: Clock = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (id) => window.clearInterval(id),
  hidden: () => document.visibilityState === 'hidden',
  onVisibilityChange: (callback) => {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
  },
};

/** `navigator.mediaSession` as the transport drives it; null in browsers without it. */
function browserSession(): SessionLike | null {
  if (!('mediaSession' in navigator)) return null;
  const session = navigator.mediaSession;
  return {
    setMetadata: (metadata) => {
      session.metadata = metadata && new MediaMetadata(metadata);
    },
    setPlaybackState: (state) => {
      session.playbackState = state;
    },
    setPositionState: (state) => session.setPositionState(state),
    setActionHandler: (action, handler) => session.setActionHandler(action, handler),
  };
}

/**
 * Install the `<audio>` transport for the signed-in session and return its cleanup; the web counterpart of the iOS
 * `setupTransport`. `isCurrent` turns false once the session changes, so late setup can bail out. The element lives
 * in JS only. Run QA with `VITE_MUTE=1` to keep it silent.
 */
export async function setupTransport(isCurrent: () => boolean): Promise<() => void> {
  if (!isCurrent()) return () => {};
  return installWebTransport({
    audio: new Audio(),
    session: browserSession(),
    clock: browserClock,
    muted: import.meta.env.VITE_MUTE === '1',
  });
}
