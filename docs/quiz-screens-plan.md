# One quiz screen

Quiz mode and Clip review now play the same game: hear a line, stop, pick its translation. Give them one layout, the current quiz page, and fix three bugs found on the phone. Done means: Clip review looks like quiz mode (lane, line card, mascot and combo, answers, player bar with cover at the bottom); in both, the coral play button replays a fully played line or clip instead of moving on; quiz mode never flips to the listen layout on its own; and tapping a song opens exactly one player at once.

## Shared layout

Extracted from `src/screens/player.tsx` and used by both screens:

- **Lane**: one segment per line (quiz) or per clip (Clip review). Current outlined, answered green or red, tap to jump.
- **Quiz column**: `LineCard`, the Answer time drain bar, `ComboRow` (mascot, NICE!, combo), `Answers`. Never scrolls.
- **PlayerBar** at the bottom with the cover. The center button is coral everywhere, including listen mode.

Clip review drops its own layout: the previous and next context lines, the cover row, the `next in 9 days` tag and the Next button go. Header keeps `title`, `artist · clip n of m` and the close button.

## Play button

| State | Icon | Press |
|---|---|---|
| Playing | pause | pause |
| Paused partway | play | resume from where it paused |
| Line or clip fully played | refresh | replay it from its start |

- **Quiz**: "fully played" is an Answer time stop. Refresh replays the line from its start (the timer stops while it replays) and it stops again at the end if still unanswered. Pressing it no longer moves to the next line; Next line does that.
- **Clip review**: "fully played" is the clip reaching its end. Play resumes inside the clip instead of leaving clip playback.

## Clip review gameplay

Mirrors a run:

- `ClipReview` stores `answers: Record<reviewId, { choice; correct }>` and `combo`, replacing `answered` and `choice`. Review list updates on answer are unchanged.
- After an answer, the result shows for 0.8 s, then the next clip loads and autoplays, same beat as quiz. The last clip ends on "All done for now" as today.
- PlayerBar Previous and Next move between clips; the lane jumps to any clip. Going back to an answered clip shows its answer and does not re-grade.
- PlayerBar time shows position within the clip.

## Bugs

- **Quiz flips to the listen layout.** Before the first line starts, `currentOccurrence` returns -1, so `currentLine` is undefined and the player falls through to the listen layout while the toggle stays on. Quiz mode always renders the quiz layout; before the first line the card shows ♪ and no choices.
- **Slow tap opens two players.** `SongRow` (and Home, album Play) runs `startSong` before `router.push('/player')`. Make the player route single-instance (`dangerouslySingular` on its `Stack.Screen`, or an equivalent guard), push first, and start the song right after. Measure where the tap delay goes and fix the cause if cheap. Until the new song's audio reports loaded, the player shows its header and cover with a small loading indicator in place of the lyrics.

## Tests

Node tests with fixtures and the fake transport:

- Quiz: refresh during a stop replays from the line's start and stops again; Next line still advances; the timer pauses during a replay.
- Clip review: resume from partway, refresh after the end, auto-advance after the 0.8 s beat, Previous to an answered clip keeps its answer, combo.
- Quiz layout state before the first line (`lineIndex` -1) stays quiz.
- Starting a song while one is loading does not double-load.

## Order of work

1. Store: clip review answers and combo, clip resume and replay, quiz replay, loading flag. Tests.
2. Shared layout components; Clip review rebuilt on them; coral play button with three states.
3. Player route single-instance, push-first song taps, loading indicator.
4. CONTEXT.md and README if behavior they describe changed. Simulator screenshots of both screens.
