import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fingerprint } from '@kashi-koi/shared/fingerprint';
import { lyricLines, pickEntry } from '@kashi-koi/shared/lyrics';
import {
  normalizeServerUrl,
  request,
  type ServerSong,
  type Session,
  type StructuredLyrics,
  searchAll,
} from '@kashi-koi/shared/subsonic';
import { openDatabase } from './db/index.ts';

/** Queue synced Japanese songs sequentially without starting an analyzer. */
export async function backfill(session: Session, store: ReturnType<typeof openDatabase>) {
  const summary = { songs: 0, queued: 0, existing: 0, skipped: 0, errors: 0 };
  const songs = await searchAll<ServerSong>(session, 'song');
  for (const song of songs) {
    summary.songs++;
    try {
      const response = await request<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>(
        session,
        'getLyricsBySongId',
        { id: song.id, enhanced: true },
      );
      const entry = pickEntry(response.lyricsList?.structuredLyrics ?? []);
      const lines = entry ? lyricLines(entry) : [];
      if (!lines.some((line) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(line))) {
        summary.skipped++;
        continue;
      }
      const hash = fingerprint(lines);
      if (store.getAnalysis(hash) || store.getJob(hash)) {
        summary.existing++;
        continue;
      }
      store.enqueue({ fingerprint: hash, title: song.title, artist: song.artist, lines, priority: 0 });
      summary.queued++;
    } catch {
      // Song metadata and lyric payloads must not leak into persisted or console errors.
      summary.errors++;
    }
  }
  return summary;
}

/** Use Subsonic token authentication so the password never enters a request URL. */
function sessionFromEnv() {
  const { NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASSWORD } = process.env;
  if (!NAVIDROME_URL || !NAVIDROME_USER || !NAVIDROME_PASSWORD)
    throw new Error('NAVIDROME_URL, NAVIDROME_USER and NAVIDROME_PASSWORD are required');
  const salt = randomBytes(16).toString('hex');
  return {
    url: normalizeServerUrl(NAVIDROME_URL),
    username: NAVIDROME_USER,
    salt,
    token: createHash('md5').update(`${NAVIDROME_PASSWORD}${salt}`).digest('hex'),
  };
}

/** The CLI shares the service database, including its committed migrations. */
async function main() {
  const session = sessionFromEnv();
  const store = openDatabase();
  try {
    const summary = await backfill(session, store);
    console.log(
      `${summary.songs} songs: ${summary.queued} queued, ${summary.existing} already analysed or queued, ` +
        `${summary.skipped} without synced Japanese lyrics, ${summary.errors} errors`,
    );
    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Backfill failed');
    process.exitCode = 1;
  });
}
