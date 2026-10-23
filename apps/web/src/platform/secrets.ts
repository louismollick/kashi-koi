import type { Secrets } from '@kashi-koi/core/navidrome/secrets';

/** Secrets live beside the rest of the device's state, under their own prefix. */
const prefix = 'secret:';

/**
 * localStorage-backed secrets and `crypto.getRandomValues` bytes; `boot.ts` installs them with `setSecrets`.
 * Browsers have no keychain, so these are only as private as the page's origin. The Navidrome login stores a token
 * and salt, never the password.
 */
export const webSecrets: Secrets = {
  storage: {
    get: async (key) => localStorage.getItem(prefix + key),
    set: async (key, value) => localStorage.setItem(prefix + key, value),
    delete: async (key) => localStorage.removeItem(prefix + key),
  },
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
};
