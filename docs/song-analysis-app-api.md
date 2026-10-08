# App sentence and analysis API

Step 3 provides data and learning behavior. The existing screens have only mechanical field and type changes. Sentence cards, intro metadata, listen grouping, notes, Settings controls and Analyse buttons still belong to step 4.

`SongLyrics` retains distinct `lines` and the timed `timeline`. It also carries `fingerprint`, distinct `sentences`, inclusive `sentenceTimeline` ranges and optional `analysis` metadata. Each timed line may have a contextual `translation`. A sentence's `lineIds` are distinct and ordered; use its occurrence range to render repeated lines in order.

Sentence IDs use the song ID and the full ordered text joined with newlines. Repeated sentences share one answer and review entry. Without an analysis, every Japanese line is its own sentence with the same ID as the line. Sentences containing no Japanese are excluded from learning. Their contextual line translations and notes remain available in listen mode.

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
getAnswers(song: Song, lineIndex: number, random?: () => number) // string[]
dueSentences(list: ReviewList, now?: number) // ReviewList
readyReviewSentences(list: ReviewList, now?: number) // ReviewList
```

`currentSentence.lines` includes repeats and uses occurrence translations when present. For previous context, call `currentSentence(songId, previous.start)`. Notes use `analysis.notes[].occurrence`, an index into `timeline`. `hasTranslations` requires at least one quizzable sentence and a translation for every quizzable sentence. Apple readiness does not gate an analyzed song.

## App state and actions

Run `answers` and `choices` use sentence IDs. `answerWait` is `{ occurrence: SentenceOccurrence, until: number | null } | null`. It holds at the exact `endMs` of `timeline[occurrence.end]`. Replay starts at `occurrence.start`. A changed sentence grouping or translation starts fresh run scoring; a furigana-only update preserves it.

```ts
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

Clip choices use sentence IDs. Clip answers retain review entry IDs to preserve the existing editing and feedback behavior. Clips use the entire first sentence occurrence. `moveReviewLine`, `removeReviewLine`, `dueLines` and `readyReviewLines` remain compatibility aliases for existing screens.

## Cache and migration

SQLite stores analyses by fingerprint. Lyrics rows store raw text and timing plus a fingerprint; loading rebuilds sentences with cached analyses and Apple translations. Rows without a fingerprint get one from their ordered timeline text on load. The next library or lyrics save writes it.

Persisted review `lineId` becomes `sentenceId`, without changing entry IDs or schedules. Whenever sentences change, entries retain valid IDs or move to the first new sentence containing a surviving old line. Duplicates retain the earliest due schedule, preferring a due entry over a new entry on a tie. Entries with no surviving match are dropped. Logout clears analyses, the token and learning state after pending writes finish.

Public reads use four workers. Playback and its queue precede the library backlog. A fingerprint is attempted once per server URL each app launch, including missing results and network failures. Admin requests can still create an analysis after a public 404. The client validates schema, fingerprint, sentence coverage and note indexes before accepting responses.

Tests inject network, persistence, SecureStore and polling waits through `setAnalysisRuntime`. Production dependencies stay lazy so plain Node store tests do not load native modules.
