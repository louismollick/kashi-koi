# Kashi-Koi!

An iOS UI shell for learning Japanese song lines. All songs, review schedules, and playback controls use local fixtures. No audio or services are connected, and no state is persisted.

## Run

Requires Node, Xcode with an iOS Simulator runtime, and CocoaPods.

```sh
npm ci
npm run ios
```

After the first native build, `npm start` starts Metro for the installed app. If port 8081 is occupied, use `npm run ios -- --port 8083`.

```sh
npx tsc --noEmit
npm test
python3 scripts/process-sprites.py
```

Sprite processing requires Pillow, already installed on the implementation machine. It reads the five original PNG assets without changing them. Generated strips and metadata are included in `assets/sprites/`.

## Try the flows

- Home's review card opens Review. Clips starts untimed Clip review; Songs starts a Review mix with Quiz mode on.
- The mini player opens the full player. Its Quiz toggle switches between Listen mode and Quiz mode.
- Answers reveal feedback for 1.2 seconds, then advance. Three consecutive hits start the headbang loop; a miss returns to bobbing.
- Listen mode advances a line every nine seconds while playing. Pause stops it. Tap the lane or an earlier line to jump.
- DIDN'T UNDERSTAND adds the current line to review. UNDO lasts three seconds. A line already in review shows a short confirmation instead of being duplicated.
- Edit opens from any review line or clip. Tap another line to move the selection; Remove from review removes it immediately. Small line-preview buttons are intentionally silent.
- Answer the last line to reach Results. Missed-line toggles start on. Again starts a new Run; Next song continues the mix or plays the next fixture song.
- Home's gear opens the settings placeholder. In development, its "Dev · nothing due" button exposes the second Home state.

The screen spec is in `docs/ui-shell-plan.md`. The ten simulator screenshots, dependency versions, file inventory, and verification evidence are listed in `docs/implementation-report.md`.
