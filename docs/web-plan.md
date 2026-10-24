# Web app plan

The web app is a client-only React DOM app in `apps/web` that shares logic and design tokens with the iOS app, not UI (ADR 0005). Phone-width web copies the iOS layouts. Wide screens get a desktop layout.

## Stack

- Vite, React 19, TanStack Router (file routes, zod-validated search params), TypeScript, Biome.
- Tailwind v4. Colors, fonts and type sizes come from `@kashi-koi/design`, through a generated `tokens.css` `@theme` file. No Shadcn and no component library: native `<dialog>`, the Popover API and small hand-written primitives that match `apps/mobile/src/components/ui.tsx`.
- Dexie (IndexedDB) for the library cache: songs, albums, artists, playlists, lyrics, translations, analyses, breakdowns. localStorage for zustand persist (learning state, settings, playback position) and the Navidrome session.
- `<audio>` with `preservesPitch` and Media Session for lock-screen controls.
- `@patdx/kuromoji` with IPADIC in a Web Worker for furigana. It implements `Translator.tokenize`. `translationStatus` is `unsupported`, so only songs with a song analysis get translations.
- `@tanstack/react-virtual` for long lists, `@dnd-kit` for Up next, `vite-plugin-pwa` so the app can be installed and the app shell and dictionary are cached. Fonts come from `@fontsource` (M PLUS Rounded 1c, Pixelify Sans), which subsets by unicode range.
- Hosting: Vercel, project root `apps/web`, SPA rewrite to `index.html`, a preview for every PR. The Kashi server sends CORS headers so the browser can call it.

## Packages

- `packages/shared`: wire contracts shared with the server (unchanged).
- `packages/core` (new): everything in `apps/mobile/src` that isn't React Native UI or a native implementation. That covers domain types, lyrics, review, fog, choices, japanese text and translate, navidrome sync, lyrics and session, analysis client, fetcher and breakdowns, the zustand stores, visibility selectors, the downloads store and queue, and the Node tests that cover them. The platform pieces are injected at app start: the library database, persist storage, secret storage, the transport, the translator and the download runtime.
- `packages/design` (new): colors, fonts, type scale, `tint`, `stepped`, a CSS stepped-corner polygon, icon path data, sprite strips and metadata, plus the `tokens.css` generator.

## Desktop (≥1024px)

- The browse column under a top bar (logo, library search, Review with its due count, Settings), the harbor pane beside it, and a now playing bar across the bottom with the transport centered. The Library, headed by Recently played, is the desktop's home. No tab bar, mini player or full-screen player.
- The harbor pane is the only place the harbor and the mascot appear: a panorama strip over the lyrics in listen mode, the full dock stage in quiz mode and clip review (which takes the pane while the review list stays in the browse column), and a dozing mascot with nothing playing. The harbor art switches to night from 7pm to 6am.
- Keyboard: Space plays and pauses, `1`/`2`/`3` answer, `L` adds a lost mark, `Q` toggles quiz mode, `S` cycles speed, ←/→ move to the previous or next line.
- Right-click opens the song menu. Breakdown and edit line open over the harbor pane.

## Not in web v1

Downloads and Offline mode, Apple translation, and tap-to-lookup (a future yomitan-core feature).

## Phases

1. Extract `packages/core` and `packages/design`. iOS consumes both, with no behavior change. Add CORS to the Kashi server.
2. Web foundation: Vite app, tokens, primitives, platform seams, login, library sync and lyrics scan, Home, Library, album, artist and playlist screens, the phone and desktop shells, and the Vercel config.
3. Playback and learning: transport, players, lyrics, quiz mode, song menu, Up next, clip review, review list, breakdown, edit line, settings, furigana worker, keyboard shortcuts, PWA.
4. Visual QA against the iOS app at 390px and on desktop, a Codex review, and the deploy.
