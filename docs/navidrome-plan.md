# Navidrome support

Replace every fixture in the app with a real Navidrome library. Done means: I can log in, browse my music, play it with lyrics following the audio, keep my review list across restarts, and re-sync from Settings.

## Decisions

- **Server**: Navidrome 0.56+ over public HTTPS with a system-trusted cert. No ATS exceptions, no self-signed support. Require the OpenSubsonic `songLyrics` extension at login.
- **Auth**: URL, username and password. Use token auth (`t = md5(password + salt)`) and generate **one salt at login**, then store `{ url, username, token, salt }` in `expo-secure-store`. The password itself is never stored. Because the salt is fixed, cover art URLs stay the same across launches, so `expo-image`'s disk cache keeps hitting. Navidrome does not ship API keys yet.
- **Library size**: under 5k songs. Fetch the whole library and keep it in memory, with SQLite as the on-disk copy. Lyrics for synced songs are loaded into memory too (a few MB). Revisit if the library goes past roughly 10k songs.
- **Meanings and furigana are deferred.** Real songs show plain synced Japanese lines. `Line.meaning` becomes optional. Quiz toggle, Clip review and Review mix are disabled for songs without meanings ("Needs translations"). Their code stays in place and keeps its test coverage through fixtures.
- **Persistence**: review list, ranks, quiz toggle, hide setting and sync timestamps persist (zustand `persist` + `expo-sqlite/kv-store`). After login the review list starts empty.
- **Recently played** comes from Navidrome's per-song `played` timestamp. Playing a song scrobbles to Navidrome and sets `played` locally, so Home updates without a sync. Hidden songs are filtered out, as they are now.
- **Two Settings actions**: **Sync library** re-fetches the library, then checks lyrics only for songs that were never checked. **Rescan lyrics** re-checks every song.
- **Playlists segment is removed** for now. Navidrome playlists need a detail screen, so they get their own follow-up.

## Dependencies

All via `npx expo install`, then a native rebuild (`npm run ios`):

- `expo-audio`: playback, background mode, lock screen. Config plugin: `["expo-audio", { "enableBackgroundPlayback": true }]`.
- `expo-sqlite`: library and lyrics tables, plus `expo-sqlite/kv-store` as zustand persist storage.
- `expo-secure-store`: session.
- `expo-crypto`: salt (`getRandomBytes`) and MD5 at login.

Hand-write a small Subsonic client instead of adding substreamer's forked `subsonic-api`. We only call about seven endpoints.

## Domain model changes

`Song` loses `lines`, `color`, `accent`, `rank` and `hasLyrics`. It mirrors the server instead:

```ts
type LyricsStatus = 'unchecked' | 'synced' | 'none' | 'error';
type Song = { id; title; artist; artistId; album; albumId; track?; disc?; year?; duration; coverArt?; played?: number; lyricsStatus: LyricsStatus };
type Album = { id; title; artist; artistId; year?; coverArt?; songCount };
type Artist = { id; name; coverArt? };
```

- **Hidden song** = `lyricsStatus !== 'synced'` while hiding is on. Unchecked songs count as hidden, so the library fills in as the first scan runs.
- **Palette**: `color`/`accent` come from a pure `paletteFor(id)` that hashes the id onto the six existing palettes. They are not stored.
- **Ranks** move to `appStore.ranks: Record<songId, Rank>`.
- **Lines follow CONTEXT.md: a repeated chorus is one line with several occurrences.**

```ts
type Line = { id: string; segments: { text: string; reading?: string }[]; meaning?: string };
type Occurrence = { lineId: string; startMs: number; endMs: number };
type SongLyrics = { songId: string; lines: Line[]; timeline: Occurrence[] };
```

`Line.id = ${songId}:${trimmedText}`, so review entries survive re-timed or re-offset LRCs. The player lane and line list iterate `timeline`. `lineIndex` becomes an index into `timeline`. Review entries still reference `lineId`. A line already in review gets the coral dot on every occurrence. Clips play a line's first occurrence.

## Lyrics parsing (`src/navidrome/lyrics.ts`, pure)

From `getLyricsBySongId` → `lyricsList.structuredLyrics[]`:

1. Pick an entry: synced with lang `ja`/`jpn`, otherwise the first synced entry, otherwise none. Unsynced only → `none`.
2. Effective time = `start - offset`. A positive offset shows lyrics sooner. Substreamer gets this backwards. Do not copy it.
3. Sort by time. Blank lines are not displayed but still end the line before them. A line ends at the next line's start; the last line ends at the song's duration.
4. Dedupe lines by trimmed text into `lines`, and keep every timed entry in `timeline`.

Transport and protocol failures become `error` and get retried by the next sync. They are never cached as `none`. Substreamer swallows these failures. Do not copy that either.

## Modules

```
src/navidrome/
  subsonic.ts     pure: normalizeServerUrl, authParams, request<T>, mediaUrl (stream, getCoverArt), response types
  session.ts      login (ping + getOpenSubsonicExtensions), loadSession, logout; sessionStore
  lyrics.ts       pure: pickEntry, toSongLyrics, currentOccurrence(timeline, positionMs)
  db.ts           expo-sqlite schema + loadAll / replaceLibrary / saveLyricsResult
  sync.ts         syncLibrary(), scanLyrics({ all }) with progress; one run at a time
src/store/libraryStore.ts   in-memory songs/albums/artists/lyrics + indexes, sync/scan progress
src/audio/transport.ts      expo-audio wrapper implementing Transport
src/data/fakeData.ts        deleted (fixtures move to scripts/fixtures.ts)
```

- **`normalizeServerUrl`**: trim, default to `https://`, strip trailing `/` and a trailing `/rest`, keep subpaths.
- **`request<T>(session, method, params)`**: GET `/rest/<method>.view` with `u,t,s,v=1.16.1,c=kashi-koi,f=json`. 15s abort timeout. Throw `SubsonicError { code, message }` for HTTP failures, bad envelopes, or `status: "failed"`. Login maps code 40 to "Wrong username or password".
- **`mediaUrl`**: the same auth params, built by the same function. Stream has no format or bitrate params (server default). Cover art uses `size` = the rendered pixel size rounded up to 150/300/600.
- **Sync**: page `search3` with `query: ""` and 500 per page, separately for songs (`songCount/songOffset`, other counts 0) and albums. Then call `getArtists` once. A short page ends paging. Replace the SQLite tables in one transaction only after every page succeeds, carrying `lyricsStatus` and lyrics over for songs that still exist. Drop review entries whose song disappeared. Set `lastSyncAt`.
- **Lyrics scan**: 4 concurrent workers over the target song ids. Write each result to SQLite as it lands, so a killed app resumes from the remaining `unchecked`/`error` songs. Update `libraryStore` progress at most once every 250ms. Set `lastScanAt`.
- **Boot**: load the session from SecureStore and `loadAll()` from SQLite into `libraryStore`, then render. With a session present, also run a background **Sync library** on launch. It is cheap: about 10 small requests for 5k songs.

## Playback

`appStore` gets an injectable transport, so store tests stay pure:

```ts
type Transport = { load(song: Song): void; play(): void; pause(): void; seek(ms: number): void };
let transport: Transport = noopTransport;
export const setTransport = (t: Transport) => { transport = t; };
```

- **`src/audio/transport.ts`**: one `createAudioPlayer(null, { updateInterval: 200 })`. On setup it calls `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`. `load` calls `player.replace({ uri: streamUrl })`, `setActiveForLockScreen(true, { title, artist, albumTitle, artworkUrl })`, and `scrobble(submission=false)`.
- **Status listener → store**:
  - `positionMs`/`durationMs` go to a narrow selector.
  - `lineIndex` is recomputed from `currentOccurrence` and set only when it changes.
  - `playing` mirrors the player, including lock-screen play and pause.
  - `didJustFinish` calls `nextSong()`.
  - Once past 50% (or 4 minutes), it sends `scrobble(submission=true)` and calls `libraryStore.markPlayed(id)`.
- **Store actions**: `startSong` loads the lyrics from `libraryStore` and calls `transport.load` + `play`. `setPlaying` calls play/pause. `jumpToLine(i)` seeks to `timeline[i].startMs`. The PlayerBar's previous/next line buttons seek too. The fake 9s `advancePlayback` timer is deleted.
- **No song yet**: `songId` becomes `string | null`, and the mini player and PlayerBar are hidden until something plays. The song does not resume after a restart (YAGNI).
- **PlayerBar** shows real position and duration.
- **Lock screen** gets play/pause and seek only. expo-audio sends next/previous only through its playlist API, which would duplicate our queue logic. Revisit if skipping from the lock screen matters.

## UI changes

- **Login screen** (`src/app/login.tsx`): server URL, username, password and a Log in button, plus an inline error line. Dark, same `PixelFrame`/`Button` components. `_layout.tsx` gates routes with `Stack.Protected guard={!!session}`. After login it goes to Home and kicks off Sync library.
- **Library**: switch to `FlatList` (`numColumns={3}` for grids) because 5k rows can't use `ScrollView.map`. Search stays in memory. The empty state while syncing reads "Syncing library… 1,200 / 4,800" or "Checking lyrics… 820 / 4,800".
- **Album/Artist detail**: songs sorted by disc and track. Artist albums sorted by year.
- **Cover**: `expo-image` with `cachePolicy="disk"` and the real `coverArt` URL inside the existing `PixelFrame` with the palette tint. With no `coverArt`, it shows the current harbor crop centered.
- **Home**: Recently played = visible songs with `played`, newest first. The review card counts come from the real review list. Drop the fake "3 new" and "next due tomorrow" copy, and the dev "nothing due" toggle.
- **Player**: plain-text `LineCard` (segments `[{ text }]`). Quiz toggle disabled with "Needs translations" when the song has no meanings.
- **Review**: the list works, and Edit/move/remove work. Clips and Songs buttons are disabled with "Needs translations".
- **Settings**:
  - **Account**: server host, username, **Log out**. Log out clears the session, SQLite, persisted state and the transport.
  - **Library**: hide toggle, then **Sync library** with "Last sync: …" and progress while running.
  - **Lyrics scan**: **Rescan lyrics**, "N songs ready to learn · M without synced lyrics · Last scan: …".

## Phases

Each phase ends with `npm run typecheck` and `npm test` green.

1. **Client + session.** Write `subsonic.ts`, `lyrics.ts`, `session.ts`, the login screen and the route gate. Unit-test URL normalization, auth params, error mapping, entry picking, offset direction, chorus dedupe, blank-line ends and `currentOccurrence`. Verify login against the server, including a wrong password and a bad URL.
2. **Library sync + scan.** Write `db.ts`, `sync.ts` and `libraryStore`, and swap every `fakeData` import for `libraryStore`. Move `scripts/fake-state.test.ts` to `scripts/app-state.test.ts`, seeding `libraryStore` from `scripts/fixtures.ts`. The fixtures keep meanings, so quiz/run/clip logic stays tested. Add the Settings Account/Sync/Rescan sections and FlatList library screens. Verify the real library shows up, hidden songs fill in during the scan, and a killed app resumes the scan.
3. **Playback.** Write the transport, store injection, real position and line following, seek-on-tap, lock-screen metadata, background playback with auto-advance while locked, scrobble and Recently played. Verify on the simulator: play an album, lines follow the audio, tapping an earlier line seeks, and audio continues with the screen locked into the next track.
4. **Persistence + cleanup.** Add zustand persist, logout wipe, delete `fakeData.ts` and the dev toggle, and update README run notes. Verify that a lost mark survives an app restart, and that logout returns to the login screen with nothing left behind.

**QA server**: implementers can use a local `deluan/navidrome` Docker container with a few ffmpeg-generated tracks and hand-written `.lrc` sidecars (one chorus, one non-zero `offset`, one unsynced, one with no lyrics). That covers every lyrics path without touching my library. Final acceptance is on my server.

## Follow-ups (not in this plan)

Translations and furigana source, then re-enabling quiz, clips and review mix. Playlists. Spaced scheduling with real due dates. Lock-screen next/previous. Audible line-preview in Edit. Offline downloads.
