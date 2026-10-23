import type { LoaderConfig } from '@patdx/kuromoji';

/** Gzip streams start with these two bytes. */
const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b;

/**
 * kuromoji's own browser loader cannot read the `.dat.gz` dictionary files, so this one fetches them from `base` and
 * decompresses them with `DecompressionStream`. If a server already decoded the gzip (a `Content-Encoding` header),
 * the bytes are used as they are. kuromoji needs plain, aligned `ArrayBuffer`s, which both paths return.
 */
export function gzipDictionaryLoader(base: string, fetcher: typeof fetch = fetch): LoaderConfig {
  return {
    async loadArrayBuffer(file) {
      const response = await fetcher(`${base}${file}`);
      if (!response.ok) throw new Error(`Could not load dictionary file ${file} (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isGzip(bytes)) return bytes.buffer;
      const plain = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(plain).arrayBuffer();
    },
  };
}
