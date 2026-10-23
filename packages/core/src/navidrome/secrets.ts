/** Where a device keeps secrets: Keychain (SecureStore) on iOS, localStorage on the web. Keys are plain strings. */
export type SecretStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

/** Platform pieces the login and the analysis token need: secret storage and cryptographically random bytes. */
export type Secrets = { storage: SecretStorage; randomBytes(length: number): Uint8Array };

let installed: Secrets | undefined;

/** Install the platform's secret storage and random source at app start. */
export function setSecrets(secrets: Secrets | undefined) {
  installed = secrets;
}

/** The installed secrets; throws (so async callers reject) until they are installed. */
export function secrets(): Secrets {
  if (!installed) throw new Error('Secret storage is not available');
  return installed;
}
