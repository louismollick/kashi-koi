# Song menu, full player and fog map

Terms are defined in `CONTEXT.md` (Fog map, Run, Perfect run, Queue, Review list, Translations toggle).

## Decisions

- **Fog map replaces Rank and Results.**
  - A song's progress is its fog map:
    - one tile per distinct sentence;
    - the first right answer gives half credit;
    - a right answer in a later run clears the tile;
    - a miss on a cleared tile turns it red;
    - one right answer clears red again;
    - a miss on a half tile sends it back to fog.
  - Clip review answers count. Each clip review session is its own run.
  - Listen mode never changes fog.
- **Perfect run.** Every sentence of a song answered right in a single run. It is kept forever and shown as a gold koi; songs without one show a "missing" koi icon.
- **Runs are disposable.**
  - Every answer updates fog and the review schedule immediately.
  - A miss goes onto the review list with the "✓ Added · UNDO" toast.
  - Turning the quiz toggle off and on within the same song keeps the run.
  - Results and letter ranks are deleted. When a quiz song ends, a toast shows the run (hits, best combo, perfect) and the next song plays.
- **Translations default to on**, and the toggle moves into the song menu.
- **Song menu**, from:
  - the player's ⋯;
  - a long-press on any song;
  - a tap on the song in the full player.

  Rows: Play next, Add to queue, Go to album, Go to artist, Download, Translations, Translation source, Re-analyze (admin).

  It replaces Song info and the per-song download sheet. Album and artist long-press keep the download sheet.
- **Queue.**
  - Playing a song from a list makes that list the queue.
  - Play next inserts after the current song, and Add to queue appends.
  - Up next shows the rest of the queue, then AUTOPLAY: a shuffle of the visible library excluding queued songs. Playback continues into it.
- **Full player** (round 9, concept 2, without the About tab, speed or loop):
  - Tapping or dragging up the slim bar on the song screen opens it.
  - Contents: cover, title, fog, scrubber, prev/play/next, Up next.
  - The slim bar keeps play/pause and next, and its progress line doesn't scrub.
- **Mark understood is dropped.**

## Store work (Codex)

`apps/mobile/src/store/appStore.ts`, `types/domain.ts`, a new `lyrics/fog.ts`, and tests in `apps/mobile/scripts/`.

- **Fog state.** Persisted `fog: Record<lineId, LineFog>`, where `LineFog = { state: 'half'; run: string } | { state: 'clear' } | { state: 'red' }`.
  - An answer applies to every line id of the sentence. A sentence takes its weakest line.
  - Line ids are stable across re-analysis, so fog survives it.
- **`lyrics/fog.ts`:**
  - `applyAnswer(fog, lineIds, correct, runId)`;
  - `songFog(songId, fog)`, which returns `{ tiles: FogTile[]; percent: number }` in sentence order, where `FogTile = 'fog' | 'half' | 'clear' | 'red'` and percent = (clear + half/2) / tiles;
  - `useSongFog(songId)`.
- **Run.** A run gets an `id`. Clip review sessions get an `id` too.
  - `perfectRuns: Record<songId, true>` (persisted) is set when every sentence of the song is answered right in one run.
  - Transient `runEnd: { songId; hits; answered; bestCombo; perfect } | null` is set when a quiz song ends, then `nextSong()` runs.
- **Deletions.** Remove `ranks`, `Rank`, `completeRun`, `getRunSummary`'s rank, `sendToReview`, and the results route and screen.
- **Answer toast.** `answer()` adds a miss to the review list (`kind: 'due'`, `misses: 1`) unless it's already there, and sets `addedId` and `addedExpiresAt` so the existing undo works.
- **Quiz toggle.** `setQuizToggle` keeps the run when toggled within the same song.
- **Translations.** `showTranslations` defaults to `true`.
- **Queue state.** Replace `playbackQueue` with `queue: string[]`, `queueIndex: number` and `autoplay: string[]`.
- **Queue actions:**
  - `startSong(songId, list?)`;
  - `playNext(songId)`;
  - `addToQueue(songId)`;
  - `playUpNext(position)`, where the position indexes `[...upcoming queue, ...autoplay]`.

  `nextSong` and `previousSong` walk the queue and skip hidden songs; `nextSong` moves into autoplay at the end. There is also a `getUpNext()` selector.

## UI work (Claude)

- **Icons:** koi (filled gold) and koi-missing, plus a ⋯ icon.
- **New components:** `FogStrip` and `FogBadge` (percent plus koi).
- **New screen:** the song menu screen and route.
- **Removals:** the Song info screen and route.
- **Player:**
  - the header gets ⋯ and the quiz toggle, and the translate button goes;
  - the toast also shows in quiz mode;
  - a song-end toast.
- **Full player:** a new screen and route. The slim `PlayerBar` is simplified to match.
- **Song rows and Home tiles:** a `FogBadge`, the song menu on long-press, and the list passed to `startSong`.
- **`SongIntro`:** the about sentence in italics and a quieter color.
