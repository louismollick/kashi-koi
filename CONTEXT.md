# Kashi-Koi!

An iOS music player for a self-hosted Navidrome library, built to help you understand the Japanese songs you already listen to, line by line.

## Language

### Lyrics

**Song**:
A track in the user's Navidrome library, with lyrics provided by Navidrome.
_Avoid_: Track (except when talking about playback)

**Line**:
One distinct line of a song's lyrics as it is sung and timed. Lines are what the app shows and follows; they are not the unit of meaning. A line repeated in a song (a chorus) is one line that occurs several times. A line with no Japanese in it is treated like an instrumental gap: shown, but never quizzed or reviewed.
_Avoid_: Lyric, card

**Sentence**:
One complete thought in a song, made of one or more consecutive lines, and the unit of learning. Japanese often splits a clause across lines (a modifier on one line, its noun or verb on the next), so a line alone can be half a thought. Quizzing and review work per sentence; a lost mark on any of its lines marks the whole sentence.
_Avoid_: Phrase, group, passage, line (when meaning a complete thought)

**Word**:
A dictionary term inside a line. Looking up words helps you understand a line, but words are not tracked or scheduled for their own sake.
_Avoid_: Vocab, card

**Song analysis**:
A reading of a whole song's lyrics, made once by an LLM and shared by every listener whose lyrics match: its sentences, a translation of the title and of each line and sentence made with the whole song in view, an about sentence explaining who speaks to whom and the gist, and an optional gap quiz per sentence. A song without one falls back to line-by-line translations.
_Avoid_: AI translation, enrichment, analysis file

**Breakdown**:
An explanation of one sentence, built chunk by chunk from dictionary forms, with hiragana readings, English glosses and short grammar notes. The server makes it on demand and shares the cached result with listeners whose lyrics match.
_Avoid_: Analysis (when meaning one sentence's explanation), annotation, lesson

**Decoy**:
A wrong phrase for a sentence's gap, with a reason it does not fit the Japanese grammar. Each decoy fits the same gap as the right phrase.
_Avoid_: Distractor, fake answer

**Translation**:
A machine translation of a line or sentence into English. It comes from the song analysis when there is one, otherwise it is made on the phone one line at a time without the rest of the song. It is the right answer in Meaning Match, but it can miss what the line actually means.
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
A tap in listen mode meaning "I just lost the thread". It immediately puts a guessed sentence (the one playing just before the tap) on the review list as a new sentence.
_Avoid_: Flag, unknown line, "review later" (that's the button's label, not the concept)

**New sentence**:
A sentence added to the review list by a lost mark that hasn't been confirmed yet. Its guess can be moved to an earlier or later sentence until it's reviewed once.
_Avoid_: Unsorted mark, pending mark, new line

**Review list**:
The sentences the user has explicitly chosen to study, either from lost marks or from the results of a run. Each sentence comes back on a spaced schedule: each right answer doubles the gap, starting at one day, and a wrong answer makes it due again. In a song without a song analysis, each line is its own sentence.
_Avoid_: Deck, queue, quest log

**Due sentence**:
A sentence on the review list whose scheduled time has come. Answering it correctly in any run, or in a clip review, completes its review for the day.
_Avoid_: Card, review item, due line

**Due later**:
A sentence on the review list answered correctly whose next scheduled time hasn't come yet.
_Avoid_: Learned, done

**Clip review**:
Reviewing due sentences one at a time by replaying just their clip, in the same layout as quiz mode but with no timer. Answering moves on to the next clip. A tested alternative to a full run that skips the rest of each song.
_Avoid_: Flashcards, quiet mode

**Meaning Match**:
The game played in quiz mode: as each sentence finishes, the user fills a gap in its translation with the right phrase or one of two decoys. Without a gap quiz, the user picks a full translation from choices drawn from the same song.
_Avoid_: Quiz, rhythm mode

**Answer time**:
How long the song waits at the end of a sentence for an answer in quiz mode. No limit by default; 0s keeps the song playing. A sentence left unanswered counts as missed.
_Avoid_: Timer, time limit

**Run**:
One play-through of a song (or of review sentences) in Meaning Match. A missed sentence goes onto the review list only if the user picks it on the results screen.
_Avoid_: Session, attempt

**Combo**:
The number of sentences answered correctly in a row within a run. A miss resets it to zero.
_Avoid_: Streak (reserve for daily habits, if ever)

**Rank**:
A song's best run grade. Separate from, and never implies, understood.
_Avoid_: Score, stars

**Understood**:
A song the user has manually marked as understood. It is a personal claim, not computed from anything.
_Avoid_: Mastered, cleared, completed
