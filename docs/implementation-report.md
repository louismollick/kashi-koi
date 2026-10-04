# Implementation report

Built the Expo SDK 57 UI shell with local fake state. No commits were created. The five original assets, source plan, glossary, and mockups were kept unchanged.

## Verification

| Criterion | Evidence |
|---|---|
| Strict types | `npx tsc --noEmit` passed. No explicit `any` in application source. |
| Sprite regeneration | `python3 scripts/process-sprites.py` passed. A second generation matched all four generated files byte-for-byte. |
| Transparency and alignment | Both strips are RGBA, 3712×464, eight 464×464 frames, with transparent corners and alpha extrema 0/255 per frame. `docs/verification/sprite-check.json` records chair-leg bounds. Headbang bounds differ by at most 3 source pixels horizontally and 1 vertically, less than 1 point at player size. Contact sheet visually checked against the navy background. |
| Native app | `npm run ios -- --device <simulator-udid> --port 8083` built and installed on iPhone 17 Pro, iOS 26.5, Xcode 27.0. Native build reported zero errors and zero warnings. |
| Bundle | `npx expo export --platform ios --output-dir .expo/export-final` passed. |
| State tests | `npm test` passed all eight tests, covering lost-mark undo and duplication, edit/removal, clip scheduling, combo, run completion, result selection, mix restoration, and empty fixtures. |
| Screens | Ten native simulator captures, each 1206×2622, listed below. |

## Simulator interactions checked

The simulator was driven with `agent-device 0.21.20`, downloaded from npm for QA, plus `xcrun simctl` screenshots.

- Home, Library, and Review navigation worked; the mini player opened the player.
- The Review Edit sheet moved the first new line to the neighboring line. Reopening from Clip review showed that move; moving back updated the current clip's text and answers.
- A correct clip answer showed its green check and `next in 9 days`. Next advanced only when tapped. Removing the next clip from its sheet immediately advanced to the remaining clip and changed `clip 2 of 12` to `clip 2 of 11`.
- In Listen mode, the lane jumped to line 6. A lost mark changed the per-song count from 4 to 5. A second mark at line 2 showed `Added · 6 in review`; UNDO returned it to 5. The toast capture is in `docs/verification/undo-toast.png`.
- Quiz toggle switched the player into Quiz mode. Three hits produced `Mascot headbang`, combo 3, NICE, and a green correct answer. The next miss produced `Mascot bobbing` and combo 0. Timed feedback advanced lines automatically.
- Completing the run opened Results with A, `NEW BEST · was B`, 12/13 hits, best combo 9, and one selected missed line. Turning its review toggle off changed reviews to 0.
- A new six-song mix reached `Review mix · song 2 of 6` through Results and Next song. Turning Quiz off opened the confirmation. Keep quiz dismissed it; Turn off changed to Listen mode. State tests confirmed unanswered lines remained due and the prior setting returned after the mix.
- Settings' dev toggle changed Home to the caught-up bar and removed the due badge.

## Screenshots

| State | Path |
|---|---|
| Home | `docs/screenshots/home.png` |
| Home, nothing due | `docs/screenshots/home-nothing-due.png` |
| Library | `docs/screenshots/library.png` |
| Review | `docs/screenshots/review.png` |
| Edit line | `docs/screenshots/edit-line.png` |
| Clip review | `docs/screenshots/clip-review.png` |
| Player, quiz off | `docs/screenshots/player-quiz-off.png` |
| Player, quiz on | `docs/screenshots/player-quiz-on.png` |
| Review mix confirmation | `docs/screenshots/review-mix-toggle-confirm.png` |
| Results | `docs/screenshots/results.png` |

Additional captures in `docs/verification/` show settings, the toast, a hit, a miss, launch, and the sprite contact sheet.

## Installed dependencies

| Runtime package | Installed version |
|---|---|
| `expo` | 57.0.26 |
| `expo-constants` | 57.0.20 |
| `expo-image` | 57.0.5 |
| `expo-linking` | 57.0.11 |
| `expo-router` | 57.0.24 |
| `expo-status-bar` | 57.0.1 |
| `react` | 19.2.3 |
| `react-dom` | 19.2.3 |
| `react-native` | 0.86.3 |
| `react-native-reanimated` | 4.5.1 |
| `react-native-safe-area-context` | 5.7.0 |
| `react-native-screens` | 4.26.2 |
| `react-native-svg` | 15.15.4 |
| `react-native-worklets` | 0.10.1 |
| `zustand` | 5.0.15 |

| Development package | Installed version |
|---|---|
| `@types/node` | 26.6.4 |
| `@types/react` | 19.3.0 |
| `tsx` | 4.23.15 |
| `typescript` | 7.0.2 |

Pixelarticons 2.4.1 is vendored as twelve SVGs and a typed path map, with its MIT license. It is not a runtime npm dependency. Pillow 11.3.0 was already installed.

## Decisions and asset findings

- Native packages use SDK 57's compatibility versions rather than npm-latest. React DOM is paired with SDK React 19.2.3 because Expo Router's optional DOM peers otherwise resolve to an incompatible React version, even in this iOS-only project.
- TypeScript 7.0.2 and React types 19.3.0 are the checked npm-latest versions. Expo's compatibility check recommends older development versions; the latest versions were kept deliberately after typecheck, native build, and bundle verification passed.
- Expo's first install replaced its running CLI and failed at the final plugin step. The compatible packages had installed; the configured app subsequently prebuilt, compiled, installed, and bundled successfully.
- T3's device panel was disabled and the computer-use inventory had no Simulator surface. Direct simulator test automation completed QA. A Metro reload did not reset the observed fixture state, so the app was relaunched to obtain clean fixtures.
- Round 7 does not contain Edit or Results markup, so those follow the written plan. Clip/song position labels reflect the actual fake flow, rather than staying fixed to sample indices.
- The plan explicitly requests the Home copy `3 new from listening` and a fake list with two NewLine entries. Both are preserved. The twelve ready lines are two new plus ten due, so the due total remains internally consistent.
- Gray backgrounds are slightly uneven. Fractional cell cuts and neighboring rod fragments are real source issues. Edge flood fill, largest-component retention, and chair registration handle them without changing originals. Small residual drawing variation remains, under one rendered point in the chair bounds.
- Artwork uses smooth image scaling. There are no font files, audio, persistence, translations, network services, Android implementation, or Library detail screens.

## Created files

Generated native build and dependency directories are ignored. The source/artifact inventory is:

```text
.gitignore
README.md
app.json
assets/icons/LICENSE
assets/icons/back.svg
assets/icons/book.svg
assets/icons/check.svg
assets/icons/close.svg
assets/icons/edit.svg
assets/icons/home.svg
assets/icons/music.svg
assets/icons/next.svg
assets/icons/pause.svg
assets/icons/play.svg
assets/icons/search.svg
assets/icons/settings.svg
assets/sprites/alignment.json
assets/sprites/bobbing.png
assets/sprites/headbang.png
assets/sprites/metadata.ts
docs/implementation-notes.md
docs/implementation-report.md
docs/screenshots/clip-review.png
docs/screenshots/edit-line.png
docs/screenshots/home-nothing-due.png
docs/screenshots/home.png
docs/screenshots/library.png
docs/screenshots/player-quiz-off.png
docs/screenshots/player-quiz-on.png
docs/screenshots/results.png
docs/screenshots/review-mix-toggle-confirm.png
docs/screenshots/review.png
docs/verification/first-launch.png
docs/verification/quiz-hit.png
docs/verification/quiz-miss.png
docs/verification/relaunch.png
docs/verification/settings-placeholder.png
docs/verification/sprite-check.json
docs/verification/sprite-contact-sheet.png
docs/verification/undo-toast.png
expo-env.d.ts
package-lock.json
package.json
scripts/fake-state.test.ts
scripts/process-sprites.py
src/app/(tabs)/_layout.tsx
src/app/(tabs)/index.tsx
src/app/(tabs)/library.tsx
src/app/(tabs)/review.tsx
src/app/_layout.tsx
src/app/clip-review.tsx
src/app/edit-line.tsx
src/app/player.tsx
src/app/results.tsx
src/app/settings.tsx
src/components/Answers.tsx
src/components/Cover.tsx
src/components/Header.tsx
src/components/Icon.tsx
src/components/LineCard.tsx
src/components/Mascot.tsx
src/components/PixelFrame.tsx
src/components/PlayerBar.tsx
src/components/TabBar.tsx
src/components/ui.tsx
src/constants/theme.ts
src/data/fakeData.ts
src/screens/clip-review.tsx
src/screens/edit-line.tsx
src/screens/home.tsx
src/screens/library.tsx
src/screens/player.tsx
src/screens/results.tsx
src/screens/review.tsx
src/screens/settings.tsx
src/store/appStore.ts
src/types/domain.ts
tsconfig.json
```

## Fix pass

A1-A7 and B1-B7 are done. `npx tsc --noEmit` passes; `npm test` passes all 17 tests. Five new regression sequences first failed against the original store. No commits or dependencies were added.

| Item | Change, file:line | Verification |
|---|---|---|
| A1 | Segmented Line data in `src/types/domain.ts:6`; per-kanji ruby and wrapping in `src/components/LineCard.tsx:9`. `src/data/fakeData.ts:98` derives plain text for lyric scroll, review, edit, clip neighbors, and results. | Native player and clip screenshots show とお / 遠, まち / 街, あか / 灯, かぞ / 数. Strict types pass. |
| A2 | Subtle bevel follows both stepped edges in `src/components/PixelFrame.tsx:25`. Square controls have explicit dimensions in `src/components/ui.tsx:26`, slate header fills in `src/components/Header.tsx:16`, and slate edit previews in `src/screens/edit-line.tsx:31`. | Visually checked all ten native captures. Edit keeps its coral current-line highlight; mini pause uses the mini fill. |
| A3 | Filled play/pause and skip icons in `src/components/Icon.tsx:5`, padded play viewBox at line 9, transport wiring in `src/components/PlayerBar.tsx:20`. SVGs are vendored in `assets/icons/`. | Native playing capture shows pause; paused capture shows play. Whole play glyph checked on Home, Clips, clip review, and Edit. Skip glyphs replace transport chevrons. Pixelarticons 1.8.1 supplies the transport glyphs; 2.4.1 lacks skip icons. |
| A4 | Cream NICE with coral text, 2pt pixel outline, and a slight tilt in `src/screens/player.tsx:23` and `src/components/PixelFrame.tsx:26`. | Quiz-on capture has 13,622 pixels of exact `#fbf8c6` and the visible coral outline. |
| A5 | Flexible mascot row in `src/screens/player.tsx:22`; quiz content grows to fill the viewport at line 96, leaving the three answers at its bottom. | Native capture shows a roughly 233pt mascot, previously 150pt, and answers directly above the bottom bar. |
| A6 | Background-colored SVG gradient overlays both scroll edges in `src/screens/player.tsx:109`. | Quiz-off capture shows lyrics fading under the lane and above the lost-mark controls. |
| A7 | Separate lyrics for all six songs in `src/data/fakeData.ts:4`; umbrella line belongs only to rain at line 42. Results pluralizes review at `src/screens/results.tsx:33`. Duplicate seeded dream review line corrected at `src/data/fakeData.ts:121`. | Fixture test at `scripts/fake-state.test.ts:239`; native Results shows "1 review". |
| B1 | Counter-generated lost and result entry IDs in `src/store/appStore.ts:85` and line 124. | Store sequences at `scripts/fake-state.test.ts:108` and line 219 verify move, re-add, undo, and removal affect distinct entries. |
| B2 | Moving resets an entry to new and clears the current clip answer in `src/store/appStore.ts:94`. | Tests at `scripts/fake-state.test.ts:125` and line 231. Native answered clip was moved, showed NEW with no Next, and accepted another answer. |
| B3 | Run records immutable choice/result pairs in `src/types/domain.ts:20`; answer lock in `src/store/appStore.ts:67`; current feedback derives from that record in `src/screens/player.tsx:50`. | Test at `scripts/fake-state.test.ts:139` covers both hits and misses. Native revisited hit ignored a wrong tap and retained combo 3. |
| B4 | Occupied edit rows are disabled and labeled in `src/screens/edit-line.tsx:28`; duplicate moves are rejected in `src/store/appStore.ts:97`. | Test at `scripts/fake-state.test.ts:163` includes due/later destinations and unchanged selection. Native accessibility reports disabled rows; Edit screenshot shows "in review". |
| B5 | Feedback timer requires playing and checks it again before advancing in `src/screens/player.tsx:67`. | Native answer then pause held line 4 and line 14 past 1.2 seconds. Resume advanced; the final-line resume opened Results. Evidence is `docs/verification/fix-pause-last-result.json`. |
| B6 | Whole-song summary in `src/store/appStore.ts:8`, used by Results at `src/screens/results.tsx:20`. Skipped lines are misses. | Test at `scripts/fake-state.test.ts:199`. Native last-only run showed C, 1 / 14 hits, 13 misses; full run showed A and 13 / 14. |
| B7 | Absolute three-second expiry and guarded undo in `src/store/appStore.ts:86`; first-render visibility and remaining timeout in `src/screens/player.tsx:51`. | Mock-clock test at `scripts/fake-state.test.ts:177` covers 2999ms and exactly 3000ms. Native leave/wait/return retained the fifth review line and showed no UNDO. |

All ten files in `docs/screenshots/` were replaced after the final code fix, retain their names, and are 1206×2622. The existing iPhone 17 Pro debug app on iOS 26.5 ran the updated Metro bundle. Each capture was visually inspected against the banner. The T3 device panel remains disabled, so native QA used agent-device 0.21.20 and simctl. No required verification remains outstanding.

## Library detail pages

Added six multi-song albums and three artists, retaining all six original song IDs, lyrics, and review fixtures. Library album and artist tiles now open detail pages inside a nested Library stack, so the mini player and tabs stay visible. Albums show artwork, artist navigation, year, song count, Play, Shuffle, and numbered song rows. Songs now uses cover/title/artist/duration rows. Filler songs show a muted `no lyrics` hint and open a centered player empty state in either quiz setting, with working transport.

Files changed: `src/types/domain.ts`, `src/data/fakeData.ts`, `src/store/appStore.ts`, `scripts/fake-state.test.ts`, `src/screens/library.tsx`, `src/screens/player.tsx`, `src/components/Cover.tsx`, and `src/components/PlayerBar.tsx`. Added `src/screens/album-detail.tsx`, `src/screens/artist-detail.tsx`, `src/components/AlbumTile.tsx`, and `src/components/SongRow.tsx`. Moved `src/app/(tabs)/library.tsx` to `src/app/(tabs)/library/index.tsx` and added its `_layout.tsx`, `album/[id].tsx`, and `artist/[id].tsx` routes. Existing shared control styling and colors were kept.

Verified `npx tsc --noEmit`, all 20 `npm test` tests, and an iOS Expo export. The no-lyrics regression failed against the original store before the fix. On the booted iPhone 17 Pro, checked Albums → album → song → player; Artists → artist → album; the album's artist link; Songs rows opening both lyric and no-lyrics songs; album Play and Shuffle; back navigation; and no-lyrics quiz toggle, pause/resume, previous/next song. Artist albums use the same three-column size as Library. The four 1206×2622 screenshots were visually inspected: `docs/screenshots/library-songs.png`, `docs/screenshots/album.png`, `docs/screenshots/artist.png`, and `docs/screenshots/player-no-lyrics.png`.

No scope deviations, dependencies, or commits. Newly selected songs now start at line zero so album Play starts at the beginning and empty lyrics remain safe. The T3 device panel was unavailable, so simulator QA used the already-installed agent-device CLI and simctl. Metro ran on port 8083 and only this task's Metro process was stopped; port 8765 was untouched.

## Library detail fix pass

The custom TabBar now receives navigator state, navigation, and descriptors. It emits `tabPress` and switches routes through the tab navigator; Expo Router's native stack listener pops a reselected tab to its existing root. No-lyrics songs advance after nine seconds through `advancePlayback()` and the existing `nextSong()`, in either quiz setting. Pause blocks progression, and the confirmation modal cancels the timer. Song ID is a timer dependency so consecutive empty tracks each get a timer. Album and artist headers show only Back; the large titles remain under their covers. Lyric durations vary from 3:13 to 4:27, retaining 夜明けのバス at 3:58.

`npx tsc --noEmit` and all 24 `npm test` tests pass. On iPhone 17 Pro, checked album → Library returns to the root with `ミナミ` search retained; Artists → artist → album → Library retains the Artists segment and query; album → Home → Library returns to the album. No-lyrics songs auto-advanced in listen and quiz modes; pausing held a track beyond nine seconds and resuming advanced it. The synthetic review mix containing a no-lyrics track is covered by a store timer test, including unchanged review lines, empty answers, and no finished run. Its combined confirmation-modal case was not checked natively because seeded review mixes contain only lyric tracks.

Recaptured and visually inspected `docs/screenshots/album.png` and `artist.png`, both 1206×2622. T3 device access was disabled; QA used the installed agent-device CLI and simctl. This pass started Metro with `npx expo start --port 8083` and stopped only that process. Port 8765 was untouched. No dependencies or commits were added.

## Hide songs without synced lyrics

Added the default-on global setting and shared `src/data/libraryVisibility.ts` helper for browsing, search, Recently played and queues, including album/artist cascade hiding and visible song counts. Thin reveal/hide rows toggle all views. Album Play/Shuffle now use visible album queues. Active queues skip newly hidden songs while leaving the current song playing. Removed no-lyrics auto-advance; both player modes stay safe until a manual skip.

Settings has the Library PixelToggle, one-line explanation, coral Scan library no-op and Lyrics scan stats. The user confirmed existing fixture counts: 6 ready songs, 13 without synced lyrics, Last scan: never. TypeScript passed and all 29 tests passed, covering visibility/cascade hiding, search, Recently played, setting changes, next/previous, album queues, review mixes, autoplay and no-lyrics stability.

Verified on iPhone 17 Pro: global rows in Songs/search/album/artist views, album reveal from 1 to 4 songs, Settings toggle and scan no-op, visible album Play, and no-lyrics songs holding beyond nine seconds in both modes. Recaptured and visually inspected `docs/screenshots/library-songs.png`, `album.png` and `settings.png`, all 1206×2622. T3 device access was disabled, so QA used installed agent-device and simctl. Stopped only this task's Metro on 8083; 8765 was untouched. No dependencies, commits or other deviations.

## Hide fix pass

Review-mix subtitles now use the pure `getReviewMixProgress` visibility helper and subscribe to the hide setting. Transport retains the original queue indices. The regression verifies that `[dawn, hiddenSong, rain]` displays song 2 of 2 on rain with hiding on, and immediately becomes 3 of 3 when hiding is off.

Vendored Pixelarticons 2.4.1's mic-off paths under the existing MIT license. Muted 16pt icons replace the no-lyrics hint immediately after row titles; fully no-lyrics albums and Library artists use 18pt icons in dark pixel cover badges. Shared pure album/artist helpers distinguish mixed collections from no-lyrics collections. Every Show/Hide row keeps its description muted and renders its action in coral at weight 700.

`npx tsc --noEmit` passes; `npm test` passes all 30 tests, including the extended mix regression and the new badge-helper cases. On iPhone 17 Pro, checked the Settings toggle off, Library song icons, album track icons, fully no-lyrics album/artist badges, artist-page album badges, and mixed albums without badges. Turning hiding back on removed the hidden rows/tiles and icons, with coral Show actions in Songs, Albums, Artists and the album page. Saved and visually inspected `docs/screenshots/library-songs-showing-all.png`, `library-albums-showing-all.png` and `album.png`, all 1206×2622. The two all-songs captures are scrolled to expose no-lyrics fixtures.

Added the requested small fixture because no existing artist or album lacked synced lyrics: artist 凪, album/song 潮の音. Settings now reports 6 ready songs and 14 without synced lyrics. T3's device panel was disabled, so native QA used the installed agent-device CLI and simctl. The native app needed an explicit `RCT_jsLocation` launch argument to connect to this pass's Metro on 8084. Only that Metro process was stopped; port 8765 was untouched. No new dependencies, commits or other scope deviations.
