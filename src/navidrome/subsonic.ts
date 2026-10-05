export type Session = { url: string; username: string; token: string; salt: string };
export type Params = Record<string, string | number | boolean>;
export type StructuredLyrics = { lang?: string; synced: boolean; offset?: number; line: { start?: number; value: string }[] };
export type ServerSong = { id: string; title: string; artist?: string; artistId?: string; album?: string; albumId?: string; track?: number; discNumber?: number; year?: number; duration?: number; coverArt?: string; played?: string };
export type ServerAlbum = { id: string; name: string; artist?: string; artistId?: string; year?: number; coverArt?: string; songCount: number };
export type ServerArtist = { id: string; name: string; coverArt?: string };

export class SubsonicError extends Error {
  constructor(public code: number, message: string) { super(message); this.name = 'SubsonicError'; }
}

/** Keep subpaths and explicit HTTP; otherwise require HTTPS. */
export function normalizeServerUrl(input: string) {
  const value = input.trim();
  if (!value) throw new SubsonicError(0, 'Enter a server URL');
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new SubsonicError(0, 'Invalid server URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new SubsonicError(0, 'Invalid server URL');
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/rest$/i, '');
  return url.toString().replace(/\/+$/, '');
}

export function authParams(session: Session, params: Params = {}) {
  return new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), u: session.username, t: session.token, s: session.salt, v: '1.16.1', c: 'kashi-koi', f: 'json' });
}

/** Both media and JSON calls use the same fixed session credentials. */
export function mediaUrl(session: Session, method: 'stream' | 'getCoverArt', id: string, pixels = 150) {
  return `${session.url}/rest/${method}.view?${authParams(session, { id, ...(method === 'getCoverArt' ? { size: pixels <= 150 ? 150 : pixels <= 300 ? 300 : 600 } : {}) })}`;
}

/** Fail closed on malformed envelopes; a missing result is not a successful scan. */
export async function request<T>(session: Session, method: string, params: Params = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${session.url}/rest/${method}.view?${authParams(session, params)}`, { signal: controller.signal });
    if (!response.ok) throw new SubsonicError(response.status, `Server returned HTTP ${response.status}`);
    const json: unknown = await response.json();
    const envelope = json && typeof json === 'object' && 'subsonic-response' in json ? json['subsonic-response'] : null;
    if (!envelope || typeof envelope !== 'object' || !('status' in envelope)) throw new SubsonicError(0, 'Invalid server response');
    if (envelope.status === 'failed') {
      const error = 'error' in envelope && envelope.error && typeof envelope.error === 'object' ? envelope.error : {};
      throw new SubsonicError('code' in error && typeof error.code === 'number' ? error.code : 0, 'message' in error && typeof error.message === 'string' ? error.message : 'Server request failed');
    }
    if (envelope.status !== 'ok') throw new SubsonicError(0, 'Invalid server response');
    return envelope as T;
  } catch (error) {
    if (error instanceof SubsonicError) throw error;
    throw new SubsonicError(0, error instanceof Error && error.name === 'AbortError' ? 'Server request timed out' : 'Could not reach the server');
  } finally { clearTimeout(timeout); }
}

export function loginError(error: unknown) {
  return error instanceof SubsonicError && error.code === 40 ? 'Wrong username or password' : error instanceof Error ? error.message : 'Could not log in';
}

/** A short page ends paging, including servers that omit an empty result. */
export async function searchAll<T>(session: Session, kind: 'song' | 'album') {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const response = await request<{ searchResult3?: { song?: T[]; album?: T[] } }>(session, 'search3', { query: '', artistCount: 0, songCount: kind === 'song' ? 500 : 0, albumCount: kind === 'album' ? 500 : 0, [`${kind}Offset`]: offset });
    const page = response.searchResult3?.[kind] ?? [];
    result.push(...page);
    if (page.length < 500) return result;
  }
}
