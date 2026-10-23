import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { md5 } from '@noble/hashes/legacy.js';
import { libraryDb } from './libraryDb';
import { secrets } from './secrets';
import { cancelAnalyses, saveAnalysisToken } from '../analysis/fetcher';
import { pauseTranslations } from '../japanese/translate';
import { resetAppState } from '../store/appStore';
import { libraryStore } from '../store/libraryStore';
import { create } from 'zustand';
import { normalizeServerUrl, request, type Session } from './subsonic';

const key = 'navidrome-session';
export const sessionStore = create<{ session: Session | null; ready: boolean; error: string | null }>(() => ({
  session: null,
  ready: false,
  error: null,
}));

/** Validate credentials and the songLyrics extension before storing token auth. */
export async function login(url: string, username: string, password: string) {
  const { storage, randomBytes } = secrets();
  const salt = bytesToHex(randomBytes(16));
  const token = bytesToHex(md5(utf8ToBytes(password + salt)));
  const session = { url: normalizeServerUrl(url), username: username.trim(), token, salt };
  await request(session, 'ping');
  const response = await request<{ openSubsonicExtensions?: { name: string; versions: number[] }[] }>(
    session,
    'getOpenSubsonicExtensions',
  );
  if (
    !response.openSubsonicExtensions?.some(
      (extension) => extension.name === 'songLyrics' && extension.versions.some((version) => version >= 1),
    )
  )
    throw new Error('This server needs the songLyrics extension');
  await storage.set(key, JSON.stringify(session));
  sessionStore.setState({ session, ready: true, error: null });
}

export async function loadSession() {
  try {
    const value = await secrets().storage.get(key);
    sessionStore.setState({ session: value ? (JSON.parse(value) as Session) : null, ready: true });
  } catch {
    sessionStore.setState({ ready: true, error: 'Could not load the saved account' });
  }
}

export async function logout() {
  sessionStore.setState({ session: null, ready: true, error: null });
  const { cancelSync } = await import('./sync');
  const { deleteAllDownloads } = await import('../downloads/queue');
  await Promise.all([cancelSync(), pauseTranslations(true), cancelAnalyses(), deleteAllDownloads()]);
  await libraryDb().clearLibrary();
  await saveAnalysisToken('');
  await resetAppState();
  libraryStore.getState().setLibrary({ songs: [], albums: [], artists: [], lyrics: {} });
  libraryStore.setState({ progress: null, error: null });
  await secrets().storage.delete(key);
}
