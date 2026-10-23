import { type SongAnalysis, songAnalysisSchema, validateAnalysis } from '@kashi-koi/shared/analysis';
import { type Breakdown, breakdownSchema } from '@kashi-koi/shared/breakdown';
import type { LyricsInput } from '@kashi-koi/core/lyrics/sentences';
import type { LibraryDb } from '@kashi-koi/core/navidrome/libraryDb';
import type { Library, LibraryInput, LyricsResult, Translations } from '@kashi-koi/core/store/libraryStore';
import type { Playlist } from '@kashi-koi/core/types/domain';
import Dexie, { type Table } from 'dexie';

/**
 * The IndexedDB implementation of core's `LibraryDb`, with the same semantics as the iOS SQLite one
 * (`apps/mobile/src/navidrome/db.ts`): every table holds one JSON-safe `data` value per key, the four library tables
 * come back in the order they were written, and each call is one transaction.
 */

type Song = Library['songs'][number];
type Album = Library['albums'][number];
type Artist = Library['artists'][number];
/** A library row. `seq` is the insertion order (SQLite's rowid), `id` the server id. */
type Row<T> = { seq?: number; id: string; data: T };

class LibraryDatabase extends Dexie {
  songs!: Table<Row<Song>, number>;
  albums!: Table<Row<Album>, number>;
  artists!: Table<Row<Artist>, number>;
  playlists!: Table<Row<Playlist>, number>;
  lyrics!: Table<{ songId: string; data: LyricsInput }, string>;
  translations!: Table<{ text: string; data: Translations[string] }, string>;
  analyses!: Table<{ fingerprint: string; data: SongAnalysis }, string>;
  breakdowns!: Table<{ fingerprint: string; start: number; data: Breakdown }, [string, number]>;

  constructor(name: string) {
    super(name);
    // `++seq, &id` keeps IndexedDB from reordering rows by id: lists show in the server's order after a reload.
    this.version(1).stores({
      songs: '++seq, &id',
      albums: '++seq, &id',
      artists: '++seq, &id',
      playlists: '++seq, &id',
      lyrics: 'songId',
      translations: 'text',
      analyses: 'fingerprint',
      breakdowns: '[fingerprint+start], fingerprint',
    });
  }
}

/** Strip translations, readings and derived sentences; the fingerprint and sentences are rebuilt from this on load. */
function rawLyrics(lyrics: LyricsInput) {
  const lines = lyrics.lines.map((line) => ({
    id: line.id,
    segments: [{ text: line.segments.map((segment) => segment.text).join('') }],
  }));
  const timeline = lyrics.timeline.map(({ lineId, startMs, endMs }) => ({ lineId, startMs, endMs }));
  return { songId: lyrics.songId, lines, timeline };
}

function validAnalysis(value: unknown, fp: string): SongAnalysis | undefined {
  const result = songAnalysisSchema.safeParse(value);
  if (!result.success || result.data.fingerprint !== fp) return undefined;
  const { title, about, lines, sentences } = result.data;
  return validateAnalysis({ title, about, lines, sentences }, lines.length).length ? undefined : result.data;
}

/** SQLite stores JSON text, which drops `undefined` fields; do the same so both platforms hold identical data. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** A fresh library database. The app uses `webLibraryDb`; tests create their own with a unique name. */
export function createLibraryDb(name = 'kashi-koi'): LibraryDb {
  const db = new LibraryDatabase(name);
  let pendingWrite: Promise<unknown> = Promise.resolve();
  /** Serialize writes, one atomic transaction each: an error rolls the whole call back. */
  const write = <T>(work: () => Promise<T>) => {
    const next = pendingWrite.catch(() => {}).then(() => work());
    pendingWrite = next;
    return next;
  };
  /** A library table's data in the order it was written. */
  const rows = <T>(table: Table<Row<T>, number>) =>
    table
      .orderBy('seq')
      .toArray()
      .then((list) => list.map((row) => row.data));
  /** One statement per table, like SQLite: drop every row, then write the new ones. */
  const replaceRows = async <T extends { id: string }>(table: Table<Row<T>, number>, items: T[] = []) => {
    await table.clear();
    // Each row's id comes from its data, like SQLite's json_extract(value, '$.id'). A duplicate id fails the call.
    await table.bulkAdd(items.map((item) => ({ id: item.id, data: plain(item) })));
  };

  return {
    async loadAll(): Promise<LibraryInput> {
      // One read transaction, so a write between tables can't tear the snapshot.
      const [songs, albums, artists, playlists, cachedLyrics, analysisRows, translationRows] = await db.transaction(
        'r',
        db.tables,
        () =>
          Promise.all([
            rows<Song>(db.songs),
            rows<Album>(db.albums),
            rows<Artist>(db.artists),
            rows<Playlist>(db.playlists),
            db.lyrics.toArray(),
            db.analyses.toArray(),
            db.translations.toArray(),
          ]),
      );
      const analyses: Record<string, SongAnalysis> = {};
      for (const row of analysisRows) {
        // Ignore malformed cached analyses so lyrics remain available offline.
        const analysis = validAnalysis(row.data, row.fingerprint);
        if (analysis) analyses[row.fingerprint] = analysis;
      }
      return {
        songs,
        albums,
        artists,
        playlists,
        translations: Object.fromEntries(translationRows.map((row) => [row.text, row.data])),
        analyses,
        lyrics: Object.fromEntries(cachedLyrics.map((item) => [item.songId, rawLyrics(item.data)])),
      };
    },

    replaceLibrary(library) {
      return write(() =>
        db.transaction('rw', [db.songs, db.albums, db.artists, db.playlists, db.lyrics], async () => {
          await replaceRows(db.songs, library.songs);
          await replaceRows(db.albums, library.albums);
          await replaceRows(db.artists, library.artists);
          await replaceRows(db.playlists, library.playlists);
          const kept = new Set(await db.songs.orderBy('id').keys());
          const cached = await db.lyrics.toCollection().primaryKeys();
          await db.lyrics.bulkDelete(cached.filter((id) => !kept.has(id)));
        }),
      );
    },

    saveLyricsResults(results: LyricsResult[]) {
      return write(() =>
        db.transaction('rw', [db.songs, db.lyrics], async () => {
          for (const { songId, status, lyrics } of results) {
            const changed = await db.songs
              .where('id')
              .equals(songId)
              .modify((row) => {
                row.data.lyricsStatus = status;
              });
            if (!changed) continue;
            if (status === 'none') await db.lyrics.delete(songId);
            else if (status === 'synced' && lyrics) await db.lyrics.put({ songId, data: plain(rawLyrics(lyrics)) });
          }
        }),
      );
    },

    savePlayed(songId, played) {
      return write(() =>
        db.songs
          .where('id')
          .equals(songId)
          .modify((row) => {
            row.data.played = played;
          })
          .then(() => {}),
      );
    },

    saveTranslations(translations: Translations) {
      return write(() =>
        db.translations
          .bulkPut(Object.entries(translations).map(([text, data]) => ({ text, data: plain(data) })))
          .then(() => {}),
      );
    },

    saveAnalysis(analysis) {
      const validated = validAnalysis(analysis, analysis.fingerprint);
      if (!validated) return Promise.reject(new Error('Invalid song analysis'));
      return write(() =>
        db.transaction('rw', [db.analyses, db.breakdowns], async () => {
          const previous = await db.analyses.get(validated.fingerprint);
          if (previous && JSON.stringify(previous.data) !== JSON.stringify(validated))
            await db.breakdowns.where('fingerprint').equals(validated.fingerprint).delete();
          await db.analyses.put({ fingerprint: validated.fingerprint, data: plain(validated) });
        }),
      );
    },

    clearLibrary() {
      return write(() =>
        db.transaction('rw', db.tables, async () => {
          await Promise.all(db.tables.map((table) => table.clear()));
        }),
      );
    },

    async readBreakdown(fingerprint, start) {
      const row = await db.breakdowns.get([fingerprint, start]);
      if (!row) return undefined;
      const value = breakdownSchema.safeParse(row.data);
      return value.success && value.data.fingerprint === fingerprint && value.data.start === start
        ? value.data
        : undefined;
    },

    saveBreakdown(breakdown) {
      return write(() =>
        db.breakdowns
          .put({ fingerprint: breakdown.fingerprint, start: breakdown.start, data: plain(breakdown) })
          .then(() => {}),
      );
    },

    deleteBreakdowns(fingerprint) {
      return write(() =>
        db.breakdowns
          .where('fingerprint')
          .equals(fingerprint)
          .delete()
          .then(() => {}),
      );
    },
  };
}

/** The app's library cache; `boot.ts` installs it with `setLibraryDb`. Opens lazily on first use. */
export const webLibraryDb = createLibraryDb();
