import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { type SongAnalysis, songAnalysisSchema, validateAnalysis } from '@kashi-koi/shared/analysis';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { type LyricsInput, timelineTexts, withSentences } from '@/lyrics/sentences';
import type { Library, Translations } from '@/store/libraryStore';
import type { LyricsStatus, SongLyrics } from '@/types/domain';

let pendingWrite = Promise.resolve();
/** Serialize scan, translation and playback writes on SQLite. */
function writeTransaction(db: SQLiteDatabase, work: (tx: SQLiteDatabase) => Promise<void>) {
  const next = pendingWrite.catch(() => {}).then(() => db.withExclusiveTransactionAsync(work));
  pendingWrite = next;
  return next;
}

const database = openDatabaseAsync('navidrome.db').then(async (db) => {
  await db.execAsync(
    'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lyrics (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS translations (text TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS analyses (fingerprint TEXT PRIMARY KEY, data TEXT NOT NULL);',
  );
  return db;
});

/** Rebuild the fingerprint from raw occurrences, including pre-analysis caches. */
function rawLyrics(lyrics: LyricsInput) {
  const lines = lyrics.lines.map((line) => ({
    id: line.id,
    segments: [{ text: line.segments.map((segment) => segment.text).join('') }],
  }));
  const timeline = lyrics.timeline.map(({ lineId, startMs, endMs }) => ({ lineId, startMs, endMs }));
  return { songId: lyrics.songId, fingerprint: fingerprint(timelineTexts({ lines, timeline })), lines, timeline };
}

function validAnalysis(value: unknown, fp: string): SongAnalysis | undefined {
  const result = songAnalysisSchema.safeParse(value);
  if (!result.success || result.data.fingerprint !== fp) return undefined;
  const { title, about, lines, sentences } = result.data;
  return validateAnalysis({ title, about, lines, sentences }, lines.length).length ? undefined : result.data;
}

export async function loadAll(): Promise<Library> {
  const db = await database;
  async function rows<T>(table: string) {
    return (await db.getAllAsync<{ data: string }>(`SELECT data FROM ${table}`)).map(
      (row) => JSON.parse(row.data) as T,
    );
  }
  const songs = await rows<Library['songs'][number]>('songs'),
    albums = await rows<Library['albums'][number]>('albums'),
    artists = await rows<Library['artists'][number]>('artists'),
    cachedLyrics = await rows<LyricsInput>('lyrics');
  const analyses: Record<string, SongAnalysis> = {};
  for (const row of await db.getAllAsync<{ fingerprint: string; data: string }>(
    'SELECT fingerprint, data FROM analyses',
  )) {
    try {
      const analysis = validAnalysis(JSON.parse(row.data), row.fingerprint);
      if (analysis) analyses[row.fingerprint] = analysis;
    } catch {
      // Ignore malformed cached analyses so lyrics remain available offline.
    }
  }
  const lyrics = cachedLyrics.map((item) => {
    const raw = rawLyrics(item);
    return withSentences(raw, analyses[raw.fingerprint]);
  });
  const translations: Translations = Object.fromEntries(
    (await db.getAllAsync<{ text: string; data: string }>('SELECT text, data FROM translations')).map((row) => [
      row.text,
      JSON.parse(row.data) as Translations[string],
    ]),
  );
  return {
    songs,
    albums,
    artists,
    translations,
    analyses,
    lyrics: Object.fromEntries(lyrics.map((item) => [item.songId, item])),
  };
}

/** Publish a complete library only after all server pages succeed. */
export async function replaceLibrary(library: Library) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    await tx.execAsync('DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM lyrics;');
    for (const table of ['songs', 'albums', 'artists'] as const)
      for (const row of library[table])
        await tx.runAsync(`INSERT INTO ${table} (id, data) VALUES (?, ?)`, row.id, JSON.stringify(row));
    for (const [id, lyrics] of Object.entries(library.lyrics))
      await tx.runAsync('INSERT INTO lyrics (id, data) VALUES (?, ?)', id, JSON.stringify(rawLyrics(lyrics)));
  });
}

/** Save each checked song atomically so an interrupted scan resumes on launch. */
export async function saveLyricsResult(songId: string, status: LyricsStatus, lyrics?: SongLyrics) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM songs WHERE id = ?', songId);
    if (!row) return;
    const song = JSON.parse(row.data) as Library['songs'][number];
    if (
      status === 'error' &&
      song.lyricsStatus === 'synced' &&
      (await tx.getFirstAsync('SELECT id FROM lyrics WHERE id = ?', songId))
    )
      return;
    await tx.runAsync(
      'UPDATE songs SET data = ? WHERE id = ?',
      JSON.stringify({ ...song, lyricsStatus: status }),
      songId,
    );
    if (status === 'none' || lyrics) await tx.runAsync('DELETE FROM lyrics WHERE id = ?', songId);
    if (status === 'synced' && lyrics)
      await tx.runAsync('INSERT INTO lyrics (id, data) VALUES (?, ?)', songId, JSON.stringify(rawLyrics(lyrics)));
  });
}

export async function savePlayed(songId: string, played: number) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM songs WHERE id = ?', songId);
    if (row)
      await tx.runAsync(
        'UPDATE songs SET data = ? WHERE id = ?',
        JSON.stringify({ ...(JSON.parse(row.data) as Library['songs'][number]), played }),
        songId,
      );
  });
}

/** Persist a translated song's lines together, deduplicated by Japanese text. */
export async function saveTranslations(translations: Translations) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    for (const [text, value] of Object.entries(translations))
      await tx.runAsync('INSERT OR REPLACE INTO translations (text, data) VALUES (?, ?)', text, JSON.stringify(value));
  });
}

export async function saveAnalysis(analysis: SongAnalysis) {
  const validated = validAnalysis(analysis, analysis.fingerprint);
  if (!validated) throw new Error('Invalid song analysis');
  const db = await database;
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      'INSERT OR REPLACE INTO analyses (fingerprint, data) VALUES (?, ?)',
      validated.fingerprint,
      JSON.stringify(validated),
    );
  });
}

export async function clearLibrary() {
  const db = await database;
  await writeTransaction(db, (tx) =>
    tx.execAsync(
      'DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM lyrics; DELETE FROM translations; DELETE FROM analyses;',
    ),
  );
}
