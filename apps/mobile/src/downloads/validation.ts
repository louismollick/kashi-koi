export type DownloadMedia = 'audio' | 'image';

/** Reject Subsonic error documents and verify artwork before exposing downloaded files. */
export function validateMediaHeader(header: Uint8Array, kind: DownloadMedia) {
  if (!header.length) throw new Error('Empty download');
  if (kind === 'audio') {
    const text = String.fromCharCode(...header)
      .replace(/^\xEF\xBB\xBF/, '')
      .trimStart();
    if (!text.length || text.startsWith('{') || text.startsWith('<') || text.startsWith('['))
      throw new Error('Downloaded response is not audio');
    return;
  }
  const starts = (bytes: number[], offset = 0) => bytes.every((byte, index) => header[offset + index] === byte);
  if (
    starts([0xff, 0xd8, 0xff]) ||
    starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) ||
    starts([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    starts([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  )
    return;
  throw new Error('Downloaded response is not an image');
}
