import type { Secrets } from '@kashi-koi/core/navidrome/secrets';
import { getRandomBytes } from 'expo-crypto';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

/** Keychain-backed secrets and native random bytes; `_layout.tsx` installs them with `setSecrets`. */
export const nativeSecrets: Secrets = {
  storage: { get: getItemAsync, set: setItemAsync, delete: deleteItemAsync },
  randomBytes: getRandomBytes,
};
