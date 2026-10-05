import { resetAppState } from '@/store/appStore';
import { libraryStore } from '@/store/libraryStore';
import { create } from 'zustand';
import { normalizeServerUrl, request, type Session } from './subsonic';

const key = 'navidrome-session';
export const sessionStore = create<{ session: Session | null; ready: boolean; error: string | null }>(() => ({ session: null, ready: false, error: null }));

/** Validate credentials and the songLyrics extension before storing token auth. */
export async function login(url: string, username: string, password: string) {
  const Crypto = await import('expo-crypto'), SecureStore = await import('expo-secure-store');
  const salt = Array.from(Crypto.getRandomBytes(16), byte => byte.toString(16).padStart(2, '0')).join('');
  const token = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, password + salt);
  const session = { url: normalizeServerUrl(url), username: username.trim(), token, salt };
  await request(session, 'ping');
  const response = await request<{ openSubsonicExtensions?: { name: string; versions: number[] }[] }>(session, 'getOpenSubsonicExtensions');
  if (!response.openSubsonicExtensions?.some(extension => extension.name === 'songLyrics' && extension.versions.some(version => version >= 1))) throw new Error('This server needs the songLyrics extension');
  await SecureStore.setItemAsync(key, JSON.stringify(session));
  sessionStore.setState({ session, ready: true, error: null });
}

export async function loadSession() {
  const SecureStore = await import('expo-secure-store');
  try { const value = await SecureStore.getItemAsync(key); sessionStore.setState({ session: value ? JSON.parse(value) as Session : null, ready: true }); }
  catch { sessionStore.setState({ ready: true, error: 'Could not load the saved account' }); }
}

export async function logout() {
  sessionStore.setState({ session: null, ready: true, error: null });
  const { cancelSync } = await import('./sync');
  await cancelSync();
  const { clearLibrary } = await import('./db');
  await clearLibrary();
  await resetAppState();
  libraryStore.getState().setLibrary({ songs: [], albums: [], artists: [], lyrics: {} });
  libraryStore.setState({ progress: null, error: null });
  const SecureStore = await import('expo-secure-store');
  await SecureStore.deleteItemAsync(key);
}
