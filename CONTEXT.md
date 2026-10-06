# Kashi-Koi!

An iOS music player for a self-hosted Navidrome library, built to help you understand the Japanese songs you already listen to, line by line.

## Language

### Lyrics

**Song**:
A track in the user's Navidrome library, with lyrics provided by Navidrome.
_Avoid_: Track (except when talking about playback)

**Line**:
One distinct line of a song's lyrics, and the unit of learning. Understanding is tracked per line, not per word. A line repeated in a song (a chorus) is one line that occurs several times. A line with no Japanese in it is treated like an instrumental gap: shown, but never quizzed or reviewed.
_Avoid_: Sentence, lyric, card

**Word**:
A dictionary term inside a line. Looking up words helps you understand a line, but words are not tracked or scheduled for their own sake.
_Avoid_: Vocab, card

**Translation**:
A machine translation of a line into English, made on the phone. It is the right answer in Meaning Match, but it can miss what the line actually means.
_Avoid_: Meaning, gloss

**Furigana**:
Kana readings shown above the kanji in a line, guessed on the phone. Quiz mode and Clip review always show them; listen mode shows them with the Translations toggle. They are dictionary readings and can miss how a word is actually sung.
_Avoid_: Ruby, readings

**Synced lyrics**:
Lyrics with a timestamp per line, which is what the app needs to follow, mark and quiz a song. Plain-text lyrics without timestamps count as no lyrics.
_Avoid_: Timed lyrics, LRC

**Hidden song**:
A song without synced lyrics, left out of browsing, search, Recently played and queues while the hide setting is on (the default). An album or artist with no visible songs is hidden too.
_Avoid_: Filtered song, unsupported song

**Lyrics scan**:
A pass over the whole library that checks each song for synced lyrics, translates them, and caches the result on the phone, so hidden songs can be known without asking the server each time.
_Avoid_: Sync, index

**Library sync**:
Re-fetching the song, album and artist list from Navidrome into the phone's copy of the library. It checks lyrics only for songs never scanned; a full Lyrics scan is separate.
_Avoid_: Refresh, import

### Modes

**Quiz toggle**:
The switch on the player that decides how songs play: quiz mode when on, listen mode when off.

**Listen mode**:
Playback with the quiz toggle off. A normal player whose only learning input is the lost mark. Nothing in listen mode counts toward a song being understood.
_Avoid_: Walk mode, passive mode

**Translations toggle**:
A listen-mode switch that shows each line's translation and furigana. Off by default, so listening stays a test of what you understand.
_Avoid_: Help mode, hints

**Quiz mode**:
Playback with the quiz toggle on. Every song played is a run of Meaning Match. Everything scored here is tested, never self-reported.
_Avoid_: Sit mode, game mode, study session

### Progress

**Lost mark**:
A tap in listen mode meaning "I just lost the thread". It immediately puts a guessed line (the one playing just before the tap) on the review list as a new line.
_Avoid_: Flag, unknown line, "didn't understand" (that's the button's label, not the concept)

**New line**:
A line added to the review list by a lost mark that hasn't been confirmed yet. Its guessed line can be moved earlier or later until it's reviewed once.
_Avoid_: Unsorted mark, pending mark

**Review list**:
The lines the user has explicitly chosen to study, either from lost marks or from the results of a run. Each line comes back on a spaced schedule: right answers push it further out, wrong ones bring it back sooner.
_Avoid_: Deck, queue, quest log

**Due line**:
A line on the review list whose scheduled time has come. Answering it correctly in any run, or in a clip review, completes its review for the day.
_Avoid_: Card, review item

**Clip review**:
Reviewing due lines one at a time by replaying just their clip, in the same layout as quiz mode but with no timer. Answering moves on to the next clip. A tested alternative to a full run that skips the rest of each song.
_Avoid_: Flashcards, quiet mode

**Review mix**:
A playlist of songs that contain due lines, played as normal runs. Starting one turns quiz mode on for that queue; the previous setting returns when it ends.
_Avoid_: Review playlist, station

**Meaning Match**:
The game played in quiz mode: as each line is sung, the user picks its translation from a few choices drawn from the same song.
_Avoid_: Quiz, rhythm mode

**Answer time**:
How long the song waits at the end of a line for an answer in quiz mode. No limit by default; 0s keeps the song playing. A line left unanswered counts as missed.
_Avoid_: Timer, time limit

**Run**:
One play-through of a song (or of review lines) in Meaning Match. A missed line goes onto the review list only if the user picks it on the results screen.
_Avoid_: Session, attempt

**Combo**:
The number of lines answered correctly in a row within a run. A miss resets it to zero.
_Avoid_: Streak (reserve for daily habits, if ever)

**Rank**:
A song's best run grade. Separate from, and never implies, understood.
_Avoid_: Score, stars

**Understood**:
A song the user has manually marked as understood. It is a personal claim, not computed from anything.
_Avoid_: Mastered, cleared, completed
