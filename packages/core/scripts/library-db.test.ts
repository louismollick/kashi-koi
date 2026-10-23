import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { setDownloadRuntime } from '../src/downloads/queue';
import { libraryDb, setLibraryDb } from '../src/navidrome/libraryDb';
import { loadLibrary } from '../src/navidrome/sync';
import { libraryStore } from '../src/store/libraryStore';
import { albums, artists, fakeLibraryDb, songs } from './fixtures';

afterEach(() => {
  setLibraryDb(undefined);
  setDownloadRuntime();
});

test('core reads and writes the library only through the installed database', async () => {
  assert.throws(() => libraryDb(), /not available/);
  await assert.rejects(loadLibrary(), /not available/);
  setDownloadRuntime({ load: async () => ({}), prepare: async () => ({ root: 'file:///downloads', art: {} }) });
  setLibraryDb(
    fakeLibraryDb({
      loadAll: async () => ({
        songs: songs.map((song) => ({ ...song, lyricsStatus: 'unchecked' as const })),
        albums,
        artists,
        playlists: [],
        translations: {},
        analyses: {},
        lyrics: {},
      }),
    }),
  );
  await loadLibrary();
  assert.equal(libraryStore.getState().songs.length, songs.length);
});
