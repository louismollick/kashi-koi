# The web app is its own React DOM app that shares logic and design tokens, not UI

The web app (`apps/web`) is a client-only Vite + TanStack Router SPA styled with Tailwind. It shares the domain logic, stores and wire contracts with the iOS app through workspace packages, and shares colors, fonts, shape math, icon paths and sprites through a design package. Screens and components are written twice, once in React Native and once in React DOM, under the same names and props. We chose this over react-native-web (Expo web) because a polished desktop and mobile web UI matters more than reusing screens: Reanimated is JS-only on web, FlashList has open web bugs, expo-sqlite web is alpha and needs COOP/COEP headers, and RN layout primitives fight normal web behavior (scrolling, selection, right-click, keyboard). The cost is two UI codebases to keep in step, which shared tokens and matching component names keep small.

Each browser is its own device: learning state stays local (ADR 0001 stands), stored in localStorage with the library cache in IndexedDB. Browsers have no on-device translation, so on web only songs with a song analysis get translations (ADR 0002's fallback is iOS only). Furigana comes from kuromoji with IPADIC in a Web Worker, behind the same `Translator.tokenize` contract as the iOS tokenizer.

## Considered options

- **Expo web / react-native-web.** Highest screen reuse, but see above.
- **TanStack Start.** Stable since October 2026 with an SPA mode, but its server runtime and server functions duplicate the Hono server, and nothing here benefits from SSR.
- **NativeWind or Uniwind on iOS to share Tailwind classes.** Would mean restyling the whole iOS app for little gain, since the component trees differ anyway.
