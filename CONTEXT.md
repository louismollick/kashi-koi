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

**Download**:
A song's audio and cover art pinned on the phone, alongside whatever song analysis and breakdowns the server already has for it. Only songs with synced Japanese lyrics can be downloaded. Downloading an album, an artist or the library downloads each of its eligible songs.
_Avoid_: Cache (reserve for the evictable copies kept while browsing), save, sync

**Offline mode**:
A setting that limits the app to downloaded songs and stops all network work. Downloaded files are used whenever they exist, online or not.
_Avoid_: Airplane mode, local mode

**Queue**:
The songs that play after the current one: the list a song, album or artist was started from, plus anything added with Play next or Add to queue. A song already in the queue moves instead of appearing twice. Up next can be reordered, trimmed or cleared. When the queue runs out, autoplay continues with a shuffle of the visible library.
_Avoid_: Playlist, up next (that's the view, not the list)

**Repeat song**:
A song menu switch on the playing song that replays it from the start, as a new run, each time it ends. Skipping or starting any song turns it off.
_Avoid_: Loop, repeat one

### Modes

**Quiz toggle**:
The switch on the player that decides how songs play: quiz mode when on, listen mode when off.

**Listen mode**:
Playback with the quiz toggle off. A normal player whose only learning input is the lost mark. Nothing in listen mode changes the fog map.
_Avoid_: Walk mode, passive mode

**Translations toggle**:
A listen-mode setting that shows each line's translation and furigana. On by default: anyone who wants to test themselves can look away, and the switch is for those who'd rather not see them at all.
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
The sentences the user studies, added by lost marks and by misses in a run (each with undo). Each sentence comes back on a spaced schedule: each right answer doubles the gap, starting at one day, and a wrong answer makes it due again. In a song without a song analysis, each line is its own sentence.
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
A stretch of quiz mode within one play of a song. It can start or stop anywhere in the song, and nothing is lost by stopping: every answer counts toward the fog map the moment it's given, and a miss goes straight onto the review list with an undo.
_Avoid_: Session, attempt

**Combo**:
The number of sentences answered correctly in a row within a run. A miss resets it to zero.
_Avoid_: Streak (reserve for daily habits, if ever)

**Fog map**:
A song's sentences shown as a strip of tiles, and the song's lasting progress as a percentage. Only tested answers (quiz mode and clip review) change it; listen mode never does. A tile clears in two passes: the first right answer thins the fog (half credit), and a right answer in a later run clears it. A miss on a cleared tile turns it red, which counts as uncleared until it's answered right again.
_Avoid_: Progress bar, completion, mastery

**Perfect run**:
A song where every sentence was answered right within a single run, following the song as it plays. Clip review never earns one. Earned once and kept, whatever later runs do. Shown as a gold koi; a song without one shows the koi missing.
_Avoid_: Rank, score, full combo, mastered
