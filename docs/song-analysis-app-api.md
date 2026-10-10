# App sentence and analysis API

Shared schemas, sentence choices, answer holding and breakdown fetching provide the data and learning behavior for the phone.

`SongLyrics` retains distinct `lines` and the timed `timeline`. It also carries `fingerprint`, distinct `sentences`, inclusive `sentenceTimeline` ranges and optional `analysis` metadata. Each timed line may have a contextual `translation`. A sentence's `lineIds` are distinct and ordered; use its occurrence range to render repeated lines in order.

Sentence IDs use the song ID and the full ordered text joined with newlines. Repeated sentences share one answer and review entry. Without an analysis, every Japanese line is its own sentence with the same ID as the line. Sentences containing no Japanese are excluded from learning. Their contextual line translations remain available in listen mode. Analyzed sentences carry two `decoys`; song metadata has no notes.

## Library selectors

Import these from `src/store/libraryStore.ts`. Select `state.lyrics[songId]` in React to subscribe to changes before calling a helper.

```ts
currentSentence(songId: string | null, lineIndex: number)
// { sentence: Sentence, occurrence: SentenceOccurrence, lines: Line[],
//   previous: SentenceOccurrence | undefined } | undefined
sentenceOccurrenceAt(songId: string | null, lineIndex: number)
// SentenceOccurrence | undefined
sentenceForReview(item: ReviewList[number])
// Same result as currentSentence, for the sentence's first occurrence
songAnalysisInfo(songId: string | null) // SongLyrics['analysis']
isAnalyzed(songId: string | null) // boolean
hasTranslations(songId: string | null) // boolean
getSentenceText(songId: string, sentence: Sentence) // string
reviewClip(item: ReviewList[number]) // { startMs: number, endMs: number } | undefined
getAnswers(song: Song, lineIndex: number, random?: () => number) // Choice[]
dueSentences(list: ReviewList, now?: number) // ReviewList
readyReviewSentences(list: ReviewList, now?: number) // ReviewList
```

`currentSentence.lines` includes repeats and uses occurrence translations when present. For previous context, call `currentSentence(songId, previous.start)`. `hasTranslations` requires at least one quizzable sentence and a translation for every quizzable sentence. Apple readiness does not gate an analyzed song.

## App state and actions

Run `answers` and `choices` use sentence IDs. `answerWait` is `{ occurrence: SentenceOccurrence, until: number | null } | null`. It holds at the exact `endMs` of `timeline[occurrence.end]`. Replay starts at `occurrence.start`. A changed sentence grouping or translation starts fresh run scoring; a furigana-only update preserves it.

```ts
appStore.getState().continueAfterAnswer() // void, release a held wrong answer
appStore.getState().setAnalysisServerUrl(url: string) // void
appStore.getState().setAnalysisToken(token: string) // Promise<void>
appStore.getState().analyzeSong(songId: string, options?: { force?: boolean }) // Promise<void>
canAnalyze() // boolean, exported by appStore.ts
appStore.getState().moveReviewSentence(reviewId: string, sentenceId: string) // void
appStore.getState().removeReviewSentence(reviewId: string) // void
appStore.getState().sendToReview(sentenceId: string, enabled: boolean) // void
```

`analysisServerUrl` persists in learning state. An empty override uses `EXPO_PUBLIC_KASHI_SERVER_URL`; both empty disable network reads. `analysisToken` is transient store state loaded from SecureStore key `analysis-token`. An empty token removes it. `canAnalyze` requires a token and effective URL; the action also requires a song with synced lines.

`analysisRequests[songId]` is `{ status: 'requesting' | 'queued' | 'running' | 'failed', error?: string, force: boolean }`. Success removes it and publishes the cached analysis. Failed requests remain for display and Retry preserves their force flag. Concurrent requests for the same song share one job. Polling runs every five seconds for up to ten minutes.

Clip choices use sentence IDs. Clip answers retain review entry IDs to preserve the existing editing and feedback behavior. Clips use the entire first sentence occurrence. Correct answers auto-advance after 800 ms. Wrong answers wait for `nextClip()`. In runs, correct answers release a held sentence after 800 ms; wrong answers keep it held until `continueAfterAnswer()` or another playback action. `moveReviewLine`, `removeReviewLine`, `dueLines` and `readyReviewLines` remain compatibility aliases for existing screens.

## Cache and migration

SQLite stores v2 analyses by fingerprint and ignores v1 cached analyses. Run and clip review choices are transient, not persisted. Lyrics rows store raw text and timing plus a fingerprint; loading rebuilds sentences with cached analyses and Apple translations. Rows without a fingerprint get one from their ordered timeline text on load. The next library or lyrics save writes it.

Persisted review `lineId` becomes `sentenceId`, without changing entry IDs or schedules. Whenever sentences change, entries retain valid IDs or move to the first new sentence containing a surviving old line. Duplicates retain the earliest due schedule, preferring a due entry over a new entry on a tie. Entries with no surviving match are dropped. Logout clears analyses, the token and learning state after pending writes finish.

Public reads use four workers. Playback and its queue precede the library backlog. A fingerprint is attempted once per server URL each app launch, including missing results and network failures. Admin requests can still create an analysis after a public 404. The client validates schema, fingerprint, sentence coverage and decoy constraints before accepting responses.

Tests inject network, persistence, SecureStore and polling waits through `setAnalysisRuntime`. Production dependencies stay lazy so plain Node store tests do not load native modules.

## Choices

`Choice` is exported from `src/types/domain.ts`:

```ts
type Choice = {
  text: string;
  parts: { text: string; marked: boolean }[];
  correct: boolean;
  reason?: string;
};
```

Run and clip `choices` are `Record<string, Choice[]>`. `answer(choice: string)` and `answerClip(choice: string)` still accept `choice.text`. Analyzed sentences use their right translation and two decoys. All options mark every distinct `from` span, at its first occurrence. `decoyChoices(translation, decoys)` in `src/lyrics/choices.ts` builds these parts before shuffling. Fallback translations each have one unmarked part.

## Breakdowns

Import from `src/analysis/breakdowns.ts`:

```ts
breakdownTarget(songId, sentenceId) // BreakdownTarget | undefined
loadBreakdown(songId, sentenceId) // Promise<void>
prefetchBreakdown(songId, sentenceId) // void
useBreakdown(songId, sentenceId) // { target, state }
canExplain(songId) // boolean
```

IDs accept `string | null | undefined`. A `BreakdownTarget` is `{fingerprint, start, text, translation}`. Repeated sentences resolve to the first occurrence's start. Songs without an analysis have no target. `canExplain` requires an analysis and an effective server URL.

`state` is undefined before loading, then one of `{status: 'loading'}`, `{status: 'ready', breakdown}`, `{status: 'failed', error}` or `{status: 'missing'}`. The non-persisted `breakdownStore.states` uses `${fingerprint}:${start}` keys. `useBreakdown` subscribes to lyrics and cached request state; call `loadBreakdown` explicitly when opening the sheet. A failed or missing request can be retried by calling it again.

Loading calls the public GET first. On 404 it calls POST only with an admin token, otherwise records `missing`. Same-key calls share a request. Ready results are reused. POST allows 270 seconds, above the server maximum of 120 seconds waiting plus two 60 second attempts. A full waiting queue returns 503. The failed state shows "Server busy, try again" for 503, "Usage limit reached, try later" for 429, or "Breakdown failed" for other errors. Client helpers `fetchBreakdown(base, fingerprint, start, sentenceText, fetcher?)` and `requestBreakdown(base, token, fingerprint, start, sentenceText, fetcher?)` return `{status: 200, breakdown}` or `{status: 404}` and validate metadata, chunk coverage and steps.

Wrong run answers, wrong clip answers and lost marks quietly prefetch only when a token is set. Logout invalidates pending responses and clears the transient cache. Changing the server URL or replacing a song analysis clears the affected results. Tests use the same `setAnalysisRuntime` network injection as song analyses.
