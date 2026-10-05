# Quiz pacing

Songs move too fast to read three choices, so quiz mode now stops at the end of each line until you answer. An **Answer time** setting controls the stop: no limit (default), a number of seconds, or 0s, which keeps the song playing like before. Done means: on a translated song in quiz mode, every Japanese line I haven't answered pauses the song when it ends, the song resumes after I answer, and Settings switches between No limit, 3s, 5s, 10s and 0s.

## Decisions

- **Setting**: `answerTime: number | null` in `appStore`, persisted, reset on logout. `null` is no limit and the default. Settings gets a Quiz section with one row that cycles `No limit`, `10s`, `5s`, `3s`, `0s`. Presets, not free entry.
- **When it stops**: when the current line's occurrence reaches its `endMs` (the next line's start, or the song's end), if the line is Japanese, has choices and has no answer in this run. Answered lines (including later occurrences of a chorus), English-only lines and listen mode never stop. With 200 ms status updates, stop on the first update at or after `endMs - 100` so at most a blip of the next line plays.
- **While stopped**: `lineIndex` stays on the line, the player shows paused, the choices stay up. With a time limit, a thin bar under the line drains over the limit. No copy.
- **Answering while stopped** shows the result for 0.8 s, then resumes. Answering before the line ends never stops.
- **Timing out** resumes with the line unanswered, which counts as a miss in the results, same as letting a line go by today. Combo is unchanged, matching today's unanswered lines.
- **Leaving the stop early**: Play, Next line, tapping the lane, Restart, turning the quiz toggle off (resumes playing), starting another song, and resuming from the lock screen all end it. A line that was stopped on and then released never stops again in that pass, so resuming a few ms before `endMs` does not stop twice. Jumping back to it does.
- **Last line**: waits even if the end-of-file status has already arrived. Releasing the wait by answering, timeout or Play completes the run.
- **Background**: the timer lives in `appStore`, not the screen, so it works on other tabs. iOS may suspend JS while paused in the background, so a timed stop can outlast its limit there. Accepted.
- Clip review is untouched; it already waits for you.

## State

```ts
answerTime: number | null;                         // persisted, seconds; null = no limit
answerWait: { lineIndex: number; until: number | null } | null; // runtime; until = epoch ms or null for no limit
```

`updatePlayback` starts the wait (pause transport, keep `lineIndex`). One module-level timer ends it. A module-level `releasedIndex` blocks a second stop on the same occurrence until a jump or new run.

## Tests

Node tests with the fake transport and `node:test` mock timers:

- Stops at the end of an unanswered Japanese line with the default setting, keeps `lineIndex`, pauses the transport.
- No stop for answered lines, repeated occurrences of an answered line, English-only lines, listen mode or `answerTime: 0`.
- Answer during a stop resumes after 0.8 s; timeout resumes and the line is missed in `getRunSummary`.
- A released line does not stop again; `jumpToLine` back to it does.
- Play, quiz toggle off, restart and a new song clear the wait and its timer.
- `answerTime` persists and resets on logout.

## Order of work

1. Store: setting, wait, timer, tests.
2. UI: Settings row, drain bar in quiz.
3. CONTEXT.md (done with this plan), README if it describes quiz pacing.
