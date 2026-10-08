# Translations

Translate every song's lines on the phone, add furigana, and turn on everything currently gated by "Needs translations": the quiz toggle, Meaning Match, results, Clips and Songs (review mix). Done means: after login and a scan, I can play any synced song in quiz mode, get a real Meaning Match with shuffled choices, send misses to review, and run clip review and a review mix from the Review tab.

See [ADR 0002](adr/0002-on-device-apple-translation.md) for why translations are Apple's on-device ones.

## Decisions

- **Source**: Apple's Translation framework, Japanese to English, on device. One `TranslationSession(installedSource: ja, target: en)` reused for the app's lifetime, batched with `translations(from:)`. Sign in with ChatGPT replaces it later.
- **Minimum iOS 26** for the whole app (the direct session initializer is iOS 26 only). Set with `expo-build-properties` so CI prebuild picks it up.
- **Language download**: prompt once automatically after login, alongside the first sync, when the ja to en pack is `supported` but not `installed`. Settings shows `Japanese translation: Installed` or a `Download` button to retry. Until it is installed, the scan still checks lyrics and translation waits.
- **When**: translation follows the lyrics scan for every synced song, so quiz mode works on any song. Whatever song starts playing, and the rest of its queue or review mix, jumps to the front. Work runs only while the app is in the foreground and resumes on next launch or foreground.
- **Storage**: a `translations` SQLite table keyed by the line's Japanese text, holding the translation and furigana segments. Keyed by text so choruses and lines shared across songs translate once, and so Rescan lyrics never redoes unchanged lines. Lyrics rows stay untranslated; translations are applied to in-memory lines on load and as they arrive.
- **Furigana**: iOS `CFStringTokenizer` (Japanese locale, Latin transcription, then Latin to Hiragana). Zero app size, native speed, and good readings in testing (below). Readings attach only to kanji; okurigana is trimmed in TypeScript.
- **Lines with no Japanese** (no kana or kanji) are treated like instrumental gaps: shown, never translated, quizzed, graded or reviewed. Mixed-language lines are translated normally.
- **Translations toggle** in listen mode: shows furigana and the translation under every line. Persisted, off by default. Quiz and clip review always show furigana. Results and Edit line always show translations.
- **Scheduling stays out of scope.** Real due dates get their own plan. "next in 9 days" text stays as is.

### Furigana tokenizer choice

Tested on macOS (same CoreFoundation tokenizer as iOS):

| Line | Tokens |
|---|---|
| 本気で好きだよ | 本気(ほんき) で 好き(すき) だ よ |
| 大好物を食べたい | 大(だい) 好物(こうぶつ) を 食べ(たべ) たい |
| 明日へ駆け出せ | 明日(あす) へ 駆け出せ(かけだせ) |
| 一人ぼっちの夜 | 一人ぼっち(ひとりぼっち) の 夜(よる) |
| 取り扱い注意 | 取り扱い(とりあつかい) 注意(ちゅうい) |
| 二人で見た景色 | 二人(ふたり) で 見(み) た 景色(けしき) |

Misses are the ones every dictionary tokenizer has (明日 as あす where songs usually sing あした). Rejected:

- **kuromoji (`@faanau/kuromoji`)**: IPADIC, so no better readings, but ships about 18 MB of dictionary, needs `DecompressionStream` and file loading that Hermes lacks, and holds the dictionary in JS memory.
- **yomitan-core**: its parser is a dictionary scan that needs an imported JMdict, which is the word-lookup feature, not this one. When yomitan-core lands for lookups, its parse can replace this furigana source.

## Native module

Local Expo module at `modules/kashi-japanese` (Swift, autolinked from `modules/`). Thin on purpose; all logic that can be tested lives in TypeScript.

```ts
type TranslationStatus = 'installed' | 'supported' | 'unsupported';
translationStatus(): Promise<TranslationStatus>;
prepareTranslation(): Promise<TranslationStatus>; // presents a SwiftUI host with .translationTask + prepareTranslation(), then rechecks status
translate(texts: string[]): Promise<string[]>;    // same order as input
tokenize(texts: string[]): Promise<{ surface: string; reading?: string }[][]>; // reading in hiragana, only for tokens containing kanji
```

`prepareTranslation` resolves after the sheet closes and returns the rechecked status, since a dismissed download can keep going in the background.

The Translation framework does not run in the Simulator. Simulator builds use a stub translator that returns `EN: <text>` so the UI can be checked there. Real translation is verified on a phone.

## Domain model changes

```ts
type Line = { id: string; segments: { text: string; reading?: string }[]; translation?: string };
```

- `meaning` becomes `translation`, `hasMeanings` becomes `hasTranslations` everywhere, including fixtures.
- `isJapanese(text)`: true if the text contains kana or kanji. Quiz lines are a song's Japanese lines.
- `hasTranslations(songId)`: the song has at least one Japanese line and every Japanese line has a translation.
- `alignReading(surface, reading)`: splits a token into kanji runs and kana runs, matches the kana runs literally against the reading, and gives each kanji run the reading between them (駆け出せ/かけだせ becomes 駆(か)け出(だ)せ). If the match fails, the whole token gets the reading. Pure and unit tested.
- `libraryStore` gains `translations: Record<text, { translation: string; segments: Line['segments'] }>` and applies them to lyrics lines on load, on `setLyricsResult`, and when new translations arrive.
- `appStore` gains persisted `showTranslations` and `translationPrompted`. Both reset on logout like the rest.

## Translation queue

`src/japanese/translate.ts`, injected like `Transport` so Node tests use a fake.

- One serial worker. A song's untranslated Japanese line texts go through `tokenize` and `translate` as one batch, are saved to SQLite in one transaction, then applied to the store.
- Fed by the end of a lyrics scan, by boot after `loadLibrary`, and by returning to the foreground (`AppState`). `startSong`, `startAlbum` and `startReviewMix` move their songs to the front.
- Skips everything while the language pack is not installed. A failed batch is skipped for this session and retried on the next run.
- Progress goes in `libraryStore` next to the scan progress. Settings shows `Translating… n / m`.

## Quiz and review

- **Choices**: the right translation plus up to two distinct translations from other Japanese lines in the same song, shuffled. Picked once per line when it becomes current (injectable random for tests). `Run.answers[lineId].choice` stores the chosen text, not an index, and correctness compares it to the line's translation. This fixes the right answer always being the middle button.
- **English-only lines in a run**: the line shows without choices, does not touch combo, and is left out of hits, total and missed in `getRunSummary`. The lane shows them like lines already passed.
- **Lost mark** on an English-only line marks the closest earlier Japanese line; before any Japanese line it does nothing.
- **Quiz toggle**: enabled when `hasTranslations(song)`. Otherwise the label is `Translating…` while the song is queued or running, `Download Japanese translation in Settings` when the pack is missing, and `No translations yet` otherwise.
- **Review tab**: Clips and Songs are enabled when at least one new or due line belongs to a translated song (the store actions already filter to those). The label becomes `n lines waiting for translations` when some don't.
- **Results**: each missed line shows its translation under the Japanese.
- **Edit line**: each line shows its translation under the Japanese.
- **Listen mode**: a `Translations` toggle next to the quiz toggle. On, every line renders with furigana and its translation below in muted text.

## Tests

Node tests with fixtures and the fake translator:

- `alignReading`: okurigana, internal kana (取り扱い), kana-only tokens, mismatches falling back to whole-token ruby.
- `isJapanese`: kana, kanji, mixed, English-only, punctuation-only.
- Choices: distinct, shuffled, contain the right answer, fewer than three when the song has few distinct translations.
- Run summary and answering skip English-only lines; lost mark redirects to the earlier Japanese line.
- Queue: priority for the playing song and its queue, persistence, resume after restart, skip while not installed, translations survive Rescan lyrics.
- Gating: quiz toggle and Review buttons follow `hasTranslations`.

## Order of work

1. Rename to `translation`, English-only handling, shuffled choices, run summary, gating. Pure TypeScript, all covered by Node tests.
2. Native module, iOS 26 target, `translations` table, queue, download prompt, Settings row.
3. UI: Translations toggle, furigana in listen mode, translations on Results and Edit line, status labels.
4. README, CONTEXT.md and implementation report updates. Device QA on a phone: download prompt, translating a real library, quiz on a translated song.

## Later

Sign in with ChatGPT for whole-song translations. yomitan-core word lookup, which can also replace furigana. Spaced scheduling. Editing a bad translation or furigana by hand.
