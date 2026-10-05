# Kashi-Koi!

An iOS music player for learning Japanese song lines from your Navidrome library. Audio and synced lyrics come from Navidrome. Your review list, ranks and settings stay on the phone.

## Run

Requires Node, Xcode with an iOS Simulator runtime, CocoaPods and Navidrome 0.56+ with the OpenSubsonic `songLyrics` extension. Use HTTPS with a system-trusted certificate. An explicit `http://localhost:4533` URL works for local simulator development.

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

- Log in with your server URL, username and password. The app stores token credentials, then syncs the library and checks songs for synced lyrics.
- Library shows albums, artists and songs. Songs without synced lyrics are hidden by default. Change this in Settings.
- Play an album or song. Lyrics follow audio, including repeated lines. Tap a line or the lane to seek. Audio continues in the background with lock-screen play, pause and seek controls.
- DIDN'T UNDERSTAND adds the current line to your review list. UNDO lasts three seconds. Repeated chorus occurrences share one review entry.
- Review lets you move or remove a line. Quiz mode, Clips and Songs need translations, which Navidrome lyrics do not yet supply.
- Settings offers Sync library, Rescan lyrics and Log out. Sync library retries unchecked and failed songs. Rescan lyrics checks every song. Log out clears local account, library and learning state.

Playback does not resume after relaunch. Playlists, translations and offline downloads are deferred. Node tests seed translated fixtures from `scripts/fixtures.ts` to keep Meaning Match, run and clip review behavior covered.

See `docs/navidrome-plan.md` and `docs/implementation-report.md` for the implementation and simulator QA evidence.
