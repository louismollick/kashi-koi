import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage as the synchronous key-value store `hydrateSettings` and `hydrateAppState` expect (the iOS app uses
 * expo-sqlite's kv-store). Keys are the same as on iOS ('settings', 'learning-state', ...).
 */
export const localState: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};
