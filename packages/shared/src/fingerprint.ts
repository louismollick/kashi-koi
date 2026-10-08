import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Hash NFC text in occurrence order without changing whitespace or repetitions. */
export function fingerprint(lines: string[]): string {
  return `v1:${bytesToHex(sha256(new TextEncoder().encode(lines.map((line) => line.normalize('NFC')).join('\n'))))}`;
}
