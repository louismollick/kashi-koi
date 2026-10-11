# Translations come from Apple's on-device Translation framework

Lines are translated on the phone with Apple's Translation framework (iOS 26 `TranslationSession`), which is why the app's minimum iOS is 26. It is free, offline and needs no account or key, so a whole library can be translated during the lyrics scan. The cost is quality: it translates line by line without the rest of the song, so a translation can miss what a lyric means and Meaning Match answers are only as good as it is. An LLM with whole-song context (via sign in with ChatGPT) is the expected upgrade; translations are stored per line so they can be replaced without touching learning state.

Amended by ADR 0003: whole-song translations come from shared song analyses; this on-device translation remains the fallback for songs without one.
