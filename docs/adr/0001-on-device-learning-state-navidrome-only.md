# Learning state lives on-device; Navidrome is the only server

All learning state (line progress, review scheduling) is stored on-device and owned by the app. There is no backend besides the user's Navidrome server, and lyrics come only from Navidrome (no LRCLIB or other lyric providers). The app is for understanding songs, not another Anki: Anki integration, if any, is an optional extra and never the source of truth. Social features (phase 2+) will need to revisit the no-backend rule.
