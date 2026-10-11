# Song analyses come from one shared Kashi server, keyed by the lyrics

Understanding a song needs the whole song in view (sentences span lines, subjects are left out), so each song gets a song analysis made once by an LLM and reused by every listener. Analyses live in one Kashi server run by the app's developer, not on each media server: a friend who connects to someone else's Navidrome gets analyses with no work from them or the server owner, and nothing in Navidrome has to change. Analyses are found by a hash of the song's lyrics as the media server returns them, so the server needs no media-server IDs or credentials to answer a lookup.

Reads are open but unlisted (lookup by hash only, no listing), analyses store no Japanese text, and there is a takedown path, because a translation of lyrics is a derivative work. Learning state still lives only on the phone (ADR 0001 otherwise stands). Apple's line-by-line translation (ADR 0002) stays as the fallback for songs without an analysis.

## Considered options

- **TTML sidecars next to the audio.** Navidrome serves translation and pronunciation layers from them, but sentences, notes and summaries have no slot except a hidden base64 track that other clients may display, each server owner must run the analyser, and it is Navidrome-only.
- **Custom audio tags via Navidrome's native API.** Needs owner config, a full rescan and a raised 1 KB tag limit, on an API Navidrome calls unstable.
- **A Navidrome plugin.** Plugins cannot expose endpoints, so it would still need a shared store and only helps other clients.
- **Static JSON behind each server's reverse proxy.** Asks every server owner to change their proxy.
