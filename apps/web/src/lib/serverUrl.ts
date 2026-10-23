import { normalizeServerUrl } from '@kashi-koi/core/navidrome/subsonic';

/** http://localhost and loopback addresses are the one case browsers let an https page call over plain http. */
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A readable error when the browser would block the server, or undefined. A page served over https can't call an
 * http:// server (mixed content), except on localhost. Invalid URLs return undefined: login reports those itself.
 */
export function mixedContentError(serverUrl: string, pageProtocol = location.protocol) {
  if (pageProtocol !== 'https:') return undefined;
  try {
    const url = new URL(normalizeServerUrl(serverUrl));
    if (url.protocol === 'http:' && !loopback.has(url.hostname))
      return 'Browsers block http:// servers on an https:// page. Your Navidrome server needs https://.';
  } catch {
    return undefined;
  }
  return undefined;
}
