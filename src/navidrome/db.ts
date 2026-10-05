import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { Library } from '@/store/libraryStore';
import type { LyricsStatus, SongLyrics } from '@/types/domain';

let pendingWrite = Promise.resolve();
/** Serialize the four scan workers and playback writes on SQLite. */
function writeTransaction(db: SQLiteDatabase, work: (tx: SQLiteDatabase) => Promise<void>) {
  const next = pendingWrite.catch(() => {}).then(() => db.withExclusiveTransactionAsync(work));
  pendingWrite = next;
  return next;
}

const database = openDatabaseAsync('navidrome.db').then(async db => {
  await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lyrics (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
  return db;
});

export async function loadAll(): Promise<Library> {
  const db = await database;
  async function rows<T>(table: string) { return (await db.getAllAsync<{ data: string }>(`SELECT data FROM ${table}`)).map(row => JSON.parse(row.data) as T); }
  const songs = await rows<Library['songs'][number]>('songs'), albums = await rows<Library['albums'][number]>('albums'), artists = await rows<Library['artists'][number]>('artists'), lyrics = await rows<SongLyrics>('lyrics');
  return { songs, albums, artists, lyrics: Object.fromEntries(lyrics.map(item => [item.songId, item])) };
}

/** Publish a complete library only after all server pages succeed. */
export async function replaceLibrary(library: Library) {
  const db = await database;
  await writeTransaction(db, async tx => {
    await tx.execAsync('DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM lyrics;');
    for (const table of ['songs', 'albums', 'artists'] as const) for (const row of library[table]) await tx.runAsync(`INSERT INTO ${table} (id, data) VALUES (?, ?)`, row.id, JSON.stringify(row));
    for (const [id, lyrics] of Object.entries(library.lyrics)) await tx.runAsync('INSERT INTO lyrics (id, data) VALUES (?, ?)', id, JSON.stringify(lyrics));
  });
}

/** Save each checked song atomically so an interrupted scan resumes on launch. */
export async function saveLyricsResult(songId: string, status: LyricsStatus, lyrics?: SongLyrics) {
  const db = await database;
  await writeTransaction(db, async tx => {
    const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM songs WHERE id = ?', songId);
    if (!row) return;
    const song = JSON.parse(row.data) as Library['songs'][number];
    if (status === 'error' && song.lyricsStatus === 'synced' && await tx.getFirstAsync('SELECT id FROM lyrics WHERE id = ?', songId)) return;
    await tx.runAsync('UPDATE songs SET data = ? WHERE id = ?', JSON.stringify({ ...song, lyricsStatus: status }), songId);
    if (status === 'none' || lyrics) await tx.runAsync('DELETE FROM lyrics WHERE id = ?', songId);
    if (status === 'synced' && lyrics) await tx.runAsync('INSERT INTO lyrics (id, data) VALUES (?, ?)', songId, JSON.stringify(lyrics));
  });
}

export async function savePlayed(songId: string, played: number) {
  const db = await database;
  await writeTransaction(db, async tx => {
    const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM songs WHERE id = ?', songId);
    if (row) await tx.runAsync('UPDATE songs SET data = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(row.data) as Library['songs'][number], played }), songId);
  });
}

export async function clearLibrary() { const db = await database; await writeTransaction(db, tx => tx.execAsync('DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM lyrics;')); }
