# Song analysis step 1

Implemented on `song-analysis`. No branch switch, push, remote-server access or `apps/server` workspace.

The Expo app moved with `git mv` into `apps/mobile`: `src`, `assets`, `modules`, app tests and sprite processing, `app.json`, `tsconfig.json` and the app package manifest. The ignored generated `expo-env.d.ts` moved there too. `docs`, `CONTEXT.md`, `README.md`, mockups and the SideStore build script remain at the root. The root package is a private npm workspace with shared tooling and workspace check scripts.

`packages/shared` contains lyric ordering and selection, the v1 NFC/SHA-256 fingerprint, Zod v4 analysis schemas, strict draft JSON Schema, validation, inferred types and the Subsonic client. Mobile retains a one-line client reexport. Both timeline construction and `lyricLines` use the same ordered entries, preserving blank timestamps and repeated occurrences. Authentication generation stays in callers and mobile still omits `enhanced: true`.

Biome formatting is isolated in `Format with Biome`. The recommended lint preset has scoped, commented exceptions for existing app invariants, effect dependencies, occurrence keys, ignored callback results and archived mockup styles. The config is `biome.jsonc` rather than `biome.json`, because Biome rejects comments in the latter. Biome formats its supported file types throughout the repository.

Shared exports point directly to TypeScript. Metro and `tsx` consume them without a build step. Step 2's server Docker/runtime setup must preserve that source consumption or explicitly compile it.

The root `assets/sidestore-icon.png` remains byte-identical to the app icon. Generated SideStore icon URLs continue to use `main/assets/sidestore-icon.png`: the new app-relative path does not exist on `main` until merge, so changing the URL would break labeled PR builds and installed sources. Build working directories and artifact paths use `apps/mobile`.

## Verification

From the repository root:

```sh
npm ci
npx biome ci .
npm run typecheck
npm test
npm run ios -- --help
bash -n scripts/build-sidestore-ipa.sh
cmp assets/sidestore-icon.png apps/mobile/assets/sidestore-icon.png
git diff --check
```

All commands passed. Biome reported three existing unused-import warnings and four style suggestions, with no errors. Both workspace typechecks passed. Tests passed: 136 mobile tests, including all 135 original tests, and nine shared tests. New Japanese fixtures are original. The forwarded iOS help command resolved to `expo run:ios --help`.

From `apps/mobile`:

```sh
npx expo config --type public
npx expo export --platform ios
npx expo prebuild --platform ios
xcodebuild -quiet -workspace ios/KashiKoi.xcworkspace -scheme KashiKoi \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO
```

All commands passed. The final export, after shared extraction and the clean install, produced a 4 MB iOS Hermes bundle. Native prebuild installed CocoaPods; the simulator build passed with upstream native warnings. The generated Expo modules provider imports and registers `KashiJapaneseModule`, with its pod sourced from `../modules/kashi-japanese/ios`.

Independent Codex reviews found no shared-contract issues and identified the SideStore icon URL issue, which was fixed. Claude Opus 5.5 verified the finding and accepted step 1 conditional on restoring those URLs. The infrastructure review also compared all 52 formatted TypeScript files through Babel and found no behavior changes.

GitHub-hosted CI and the release IPA/SideStore publishing workflow were not executed. No physical-device launch was performed. Actual Codex/OpenAI structured-output acceptance and the server Docker build belong to step 2 and remain unverified.
