# UI polish and review scheduling

Cut repeated text and empty subtitles, give every playback screen one shape, and make "Due today" real.

## Home

- Review card reads REVIEW / count / LYRICS, all caps at the same size. No "new from listening" line. The round button shows an arrow, since the card opens the Review tab.
- Recently played has no chevron. Rank badges only show for ranked songs.
- The mini player has a thin coral progress line along its bottom edge. Display only.

## Player, quiz and clip review

One sheet that slides up, with a down chevron.

- Header: chevron, progress text, then toggles on the right. Listen has no text and shows Translations and Quiz. Quiz shows "Line 4 of 16" and the Quiz toggle. Clip review shows "Reviewing lyric 1 of 15" and no toggles.
- No lane. The bottom PlayerBar carries everything else:
  - a coral progress line across the top of the bar. It scrubs the song in listen and quiz modes; clip review shows it but doesn't scrub;
  - the cover, a scrolling title and the artist;
  - Previous, Play and Next. Clip review has only Play.
- The line is always full width. Its 28 pt touch band maps x from 16 to width − 16 onto the song, clamped, so dragging into either screen edge reaches the start or end. The time shows above the finger only while dragging.
- Listen lyrics: plain left-aligned rows with no card. The current line is white and every other line is gray, including furigana and translation. The current line stays centred: the list has half a viewport of padding at the top and bottom.
- Furigana sit closer to the kanji, and wrapped rows don't overlap.
- REVIEW LATER is one line with no subtitle. It's disabled for lines without Japanese, and reads IN REVIEW, disabled, when the current line is already in review. Adding a line shows a floating "Added · UNDO" above the button. The "N lines from this song in review" line is gone. There is more space between the button and the progress line.

## Review tab

- One coral "Review Lyrics" button with "~4 min" (placeholder). The Songs review mix is removed from the app.
- Sections in order: Due today, then New from listening, then a Due later row (placeholder, not tappable). Empty sections are hidden. Section headers have no hints and show "29 lines from 15 songs" on the right.
- Lines are grouped under one song row: cover, title and artist, styled like Library's Songs. Below it, each missed line has an edit button. Tapping a section header or a song row collapses it, with no indicator. No NEW or MISSED tags.

## Edit drawer

Title "Study a different lyric", a close button at the top left, and a coral trash button at the top right that removes the line and closes the drawer. Below that, the song's Japanese lines in the listen-mode style, centred on the current pick. Lines already in review carry the coral dot and can't be picked. No preview button and no subtitles.

## Scheduling

- A line answered right becomes Due later with `step` and `dueAt`. The first right answer gives 1 day, and each further right answer doubles the gap.
- A wrong answer makes it due again and resets `step`.
- A Due later line whose `dueAt` has passed counts as due everywhere: Due today, the badges and clip review.
- Due later lines saved before this change have no schedule, so they're due now.
