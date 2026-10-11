import { type Breakdown, breakdownSchema } from '@kashi-koi/shared/breakdown';
import type { DownloadEntries, DownloadEntry } from '@/downloads/store';
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
    'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lyrics (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS translations (text TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS analyses (fingerprint TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS downloads (id TEXT PRIMARY KEY, status TEXT NOT NULL, file_name TEXT, bytes INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT); CREATE TABLE IF NOT EXISTS breakdowns (fingerprint TEXT NOT NULL, start INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (fingerprint, start));',
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
    const previous = await tx.getFirstAsync<{ data: string }>(
      'SELECT data FROM analyses WHERE fingerprint = ?',
      validated.fingerprint,
    );
    if (previous && previous.data !== JSON.stringify(validated))
      await tx.runAsync('DELETE FROM breakdowns WHERE fingerprint = ?', validated.fingerprint);
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
      'DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM lyrics; DELETE FROM translations; DELETE FROM analyses; DELETE FROM breakdowns;',
    ),
  );
}

/** Per-song queue state survives process death, including interrupted transfers. */
export async function loadDownloads(): Promise<DownloadEntries> {
  const db = await database;
  const rows = await db.getAllAsync<{
    id: string;
    status: DownloadEntry['status'];
    file_name: string | null;
    bytes: number | null;
    created_at: number;
    updated_at: number;
    error: string | null;
  }>('SELECT * FROM downloads');
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        status: row.status,
        fileName: row.file_name ?? undefined,
        bytes: row.bytes ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        error: row.error ?? undefined,
      },
    ]),
  );
}
export async function saveDownload(id: string, entry: DownloadEntry) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      'INSERT OR REPLACE INTO downloads (id, status, file_name, bytes, created_at, updated_at, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      entry.status,
      entry.fileName ?? null,
      entry.bytes ?? null,
      entry.createdAt,
      entry.updatedAt,
      entry.error ?? null,
    );
  });
}
export async function deleteDownload(id: string) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM downloads WHERE id = ?', id);
  });
}
export async function clearDownloads() {
  const db = await database;
  await writeTransaction(db, (tx) => tx.execAsync('DELETE FROM downloads;'));
}

/** Shared breakdowns are cached for every online read, not just downloaded songs. */
export async function readBreakdown(fp: string, start: number): Promise<Breakdown | undefined> {
  const row = await (await database).getFirstAsync<{ data: string }>(
    'SELECT data FROM breakdowns WHERE fingerprint = ? AND start = ?',
    fp,
    start,
  );
  if (!row) return undefined;
  try {
    const value = breakdownSchema.safeParse(JSON.parse(row.data));
    return value.success && value.data.fingerprint === fp && value.data.start === start ? value.data : undefined;
  } catch {
    return undefined;
  }
}
export async function saveBreakdown(breakdown: Breakdown) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    await tx.runAsync(
      'INSERT OR REPLACE INTO breakdowns (fingerprint, start, data) VALUES (?, ?, ?)',
      breakdown.fingerprint,
      breakdown.start,
      JSON.stringify(breakdown),
    );
  });
}
export async function deleteBreakdowns(fp: string) {
  const db = await database;
  await writeTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM breakdowns WHERE fingerprint = ?', fp);
  });
}
