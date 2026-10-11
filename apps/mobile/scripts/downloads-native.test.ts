import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

/** Exercise the real native transfer adapter with a file handle instead of loading Expo in Node. */
test('native downloads sniff file handles, close them on validation failures, and report byte progress', async () => {
  let body = new TextEncoder().encode('fLaC'),
    closed = 0;
  const options: { signal?: AbortSignal }[] = [];
  class File {
    static async downloadFileAsync(
      _url: string,
      file: File,
      config: { signal?: AbortSignal; onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void },
    ) {
      options.push(config);
      config.onProgress?.({ bytesWritten: 5, totalBytes: -1 });
      config.onProgress?.({ bytesWritten: 5, totalBytes: 10 });
      config.onProgress?.({ bytesWritten: 10, totalBytes: 10 });
      return file;
    }
    get size() {
      return body.length;
    }
    open() {
      return {
        readBytes: (length: number) => body.slice(0, length),
        close: () => {
          closed++;
        },
      };
    }
  }
  const key = Symbol.for('kashi.downloads.files');
  const globals = globalThis as typeof globalThis & { [key]: typeof File | undefined };
  globals[key] = File;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'expo-file-system') return { url: 'test:download-files', shortCircuit: true };
      if (
        context.parentURL?.includes('/downloads/native.ts') &&
        ['react-native', '../../modules/kashi-downloads', '@/navidrome/db'].includes(specifier)
      )
        return { url: 'test:download-native-stub', shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'test:download-files')
        return {
          format: 'commonjs',
          source: "exports.File = globalThis[Symbol.for('kashi.downloads.files')];",
          shortCircuit: true,
        };
      if (url === 'test:download-native-stub')
        return { format: 'commonjs', source: 'module.exports = {};', shortCircuit: true };
      return next(url, context);
    },
  });
  try {
    const { downloadFile } = await import('../src/downloads/native');
    const controller = new AbortController(),
      progress: number[] = [];
    assert.equal(
      await downloadFile('https://music.test', 'file:///audio.part', controller.signal, 'audio', (fraction) =>
        progress.push(fraction),
      ),
      4,
    );
    assert.deepEqual(progress, [0.5, 1]);
    assert.equal(options[0]?.signal, controller.signal);
    assert.equal(closed, 1);
    for (const kind of ['audio', 'image'] as const) {
      for (const text of ['  {"subsonic-response":{"status":"failed"}}', '\n<subsonic-response status="failed"/>']) {
        body = new TextEncoder().encode(text);
        await assert.rejects(
          downloadFile('https://music.test', 'file:///media.part', controller.signal, kind),
          /not audio|not an image/,
        );
      }
    }
    assert.equal(closed, 5);
    body = new Uint8Array([0xff, 0xd8, 0xff]);
    assert.equal(await downloadFile('https://music.test', 'file:///art.part', controller.signal, 'image'), 3);
    assert.equal(closed, 6);
  } finally {
    hooks.deregister();
    delete globals[key];
  }
});
