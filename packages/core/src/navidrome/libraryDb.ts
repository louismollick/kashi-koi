import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import type { Breakdown } from '@kashi-koi/shared/breakdown';
import type { Library, LibraryInput, LyricsResult, Translations } from '../store/libraryStore';

/**
 * The device's persistent library cache: SQLite on iOS, IndexedDB on the web. Core calls only these operations and
 * knows nothing about the storage behind them. Writes must be serialized by the implementation and each call must
 * be atomic (a failed call leaves the stored library as it was).
 */
export type LibraryDb = {
  /** Read the whole cache. Lyrics stay raw; `setLibrary` derives their sentences once. */
  loadAll(): Promise<LibraryInput>;
  /** Publish a complete library and drop cached lyrics of removed songs; other cached lyrics stay as they are. */
  replaceLibrary(library: Pick<Library, 'songs' | 'albums' | 'artists' | 'playlists'>): Promise<void>;
  /** Save a scan batch atomically. Results for songs no longer in the library are skipped. */
  saveLyricsResults(results: LyricsResult[]): Promise<void>;
  /** Record when a song was last played. */
  savePlayed(songId: string, played: number): Promise<void>;
  /** Persist a translated song's lines together, keyed by Japanese text. */
  saveTranslations(translations: Translations): Promise<void>;
  /** Replace a song analysis; a different analysis for the same fingerprint drops that fingerprint's breakdowns. */
  saveAnalysis(analysis: SongAnalysis): Promise<void>;
  /** Wipe songs, albums, artists, playlists, lyrics, translations, analyses and breakdowns. */
  clearLibrary(): Promise<void>;
  /** A cached breakdown, or undefined when absent or no longer valid for this fingerprint and start. */
  readBreakdown(fingerprint: string, start: number): Promise<Breakdown | undefined>;
  saveBreakdown(breakdown: Breakdown): Promise<void>;
  /** Drop every cached breakdown of one song analysis. */
  deleteBreakdowns(fingerprint: string): Promise<void>;
};

let installed: LibraryDb | undefined;

/** Install the platform's library database at app start, before anything loads or syncs. */
export function setLibraryDb(db: LibraryDb | undefined) {
  installed = db;
}

/** The installed database; throws (so async callers reject) until one is installed. */
export function libraryDb(): LibraryDb {
  if (!installed) throw new Error('Library database is not available');
  return installed;
}
