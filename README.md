# Kashi-Koi!

An iOS music player for learning Japanese song lines from your Navidrome library. Audio and synced lyrics come from Navidrome. Your review list, ranks and settings stay on the phone.

## Run

Requires iOS 26 or later, Node, Xcode with an iOS 26+ SDK and Simulator runtime, CocoaPods and Navidrome 0.56+ with the OpenSubsonic `songLyrics` extension. Use HTTPS with a system-trusted certificate. An explicit `http://localhost:4533` URL works for local simulator development.

```sh
npm ci
npm run ios
```

After the first native build, `npm start` starts Metro for the installed app. If port 8081 is occupied, use `npm run ios -- --port 8083`. Native dependency or plugin changes require `npx expo prebuild --platform ios` followed by another native build.

```sh
npm run typecheck
npm test
python3 scripts/process-sprites.py
```

Sprite processing requires Pillow. Generated strips and metadata are included in `assets/sprites/`.

## Install builds

Add this source in SideStore: `https://github.com/louismollick/kashi-koi/releases/download/ios-source/source.json`

It lists the latest `main` build plus one app per PR labeled `ios-build`. PR apps install side by side with main. Removing the label or closing the PR removes its app from the source. See `.github/workflows/sidestore.yml`.

## Use

- Log in with your server URL, username and password. The app offers the Japanese to English language download, then syncs the library and checks songs for synced lyrics. Translation continues on the phone while the app is open, with the playing song and its queue first. Retry the language download in Settings.
- Library shows albums, artists and songs. Songs without synced lyrics, or whose lyrics have no Japanese, are hidden by default. Change either in Settings.
- Play an album or song. Lyrics follow audio, including repeated lines, with the current line centred. Tap a line or drag the coral line above the player to seek. Audio continues in the background with lock-screen play, pause and seek controls.
- REVIEW LATER adds the current Japanese line to your review list. UNDO lasts three seconds. Repeated chorus occurrences share one review entry.
- Turn on Translations in listen mode to show English translations and furigana. Quiz mode always shows furigana and asks you to choose a Line's translation in Meaning Match. Choices come from the same song and are shuffled. Unanswered Japanese lines pause at their end until you answer, then resume after 0.8 seconds. Settings offers Answer time: No limit, 10s, 5s, 3s or 0s to keep playing. A timed-out line counts as missed. The coral refresh button replays a stopped line; its Answer time starts again when the replay ends. Quiz mode keeps its layout during the intro before the first line. Lines without Japanese stay outside grading and review.
- Results shows missed Lines and their translations. Review groups due, new and due-later Lines by song; edit one to study a different Line of its song or remove it. A right answer schedules a Line one day out and doubles the gap each time; a wrong answer makes it due again. Review Lyrics plays each translated due Line's clip in the quiz layout, keeps each first answer, and moves on 0.8 seconds after you answer. Its play button resumes a paused clip or replays a finished one.
- Settings offers Sync library, Rescan lyrics and Log out. Sync library retries unchecked and failed songs. Rescan lyrics checks every song. Log out clears local account, library and learning state.

Translations and furigana are cached by Japanese text and survive Rescan lyrics. Apple translates each Line without the rest of the song; translations and dictionary readings can miss what is sung. The Simulator uses `EN: <Japanese text>` translations with the native furigana tokenizer. Real translations and language downloads require a phone.

Playback does not resume after relaunch. Playlists and offline downloads are deferred. Node tests use translated fixtures and an injected translator, without loading native modules.

See `docs/translations-plan.md`, `docs/navidrome-plan.md` and `docs/implementation-report.md` for the implementation and simulator QA evidence.
