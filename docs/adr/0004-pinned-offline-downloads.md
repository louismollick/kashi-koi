# Offline text stays in SQLite; downloaded audio and art stay in Documents

SQLite remains the single cache for library metadata, synced lyrics, translations and song analyses. Sentence breakdowns now use the same database, keyed by fingerprint and sentence start, including explanations opened online. Replacing an analysis deletes its obsolete breakdowns.

A per-song downloads table records queue status, relative audio file name, bytes, timestamps and a short failure. Audio and shared 600-pixel cover art live in Documents/downloads/audio and Documents/downloads/art. The downloads directory is excluded from iCloud backup. Files use temporary names and rename only after successful transfers. expo-image's disk cache remains the evictable cache for browsing, independent of these pinned files.

Only songs with synced Japanese lyrics are eligible. Three workers resume interrupted rows in the foreground at launch. A user download tap can additionally start an iOS 26 continued-processing task; expiration aborts transfers and preserves unfinished rows for later. Offline mode filters browsing and queues to completed downloads and suppresses network work. Local audio and artwork always take precedence, including while online.
