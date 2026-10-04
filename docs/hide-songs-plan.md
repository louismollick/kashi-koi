# Hide songs without synced lyrics

The implementation brief authorizes this change. Work only in Kashi-Koi; do not commit.

1. Add one visibility helper and a default-on store setting. Route browsing, search, Recently played and queues through it. Verify song visibility and album/artist cascade hiding in both states.
2. Add thin global-toggle rows and Settings using existing components. Remove empty-song auto-advance. Verify queue steps, album Play/Shuffle, review mixes, toggling during playback and safe empty lyrics with store tests and strict types.
3. Run a task-owned Metro, verify the rows and Settings on the booted iPhone 17 Pro, recapture the three requested screenshots and append the report. Stop only that Metro process.

Deliberate review: a currently playing hidden song must retain its place in the original queue, so next/previous must look from its original position rather than its index in the visible list. Active review mixes must also skip songs hidden after the mix started. Detail pages can remain open after hiding their entire album or artist, so empty Play/Shuffle actions must be disabled. Reversal rows count what the current view would hide even when the setting is off. Existing fake fixtures have six ready songs and thirteen without synced lyrics; Settings will compute actual counts unless the user requests separate scan totals.

Baseline: TypeScript and all 24 tests pass. Device panel access is disabled; installed agent-device and simctl are available.

## Completed

All three steps passed. The user confirmed using existing fake song counts, so Settings shows 6 ready songs and 13 without synced lyrics. TypeScript and all 29 tests pass, including active-queue setting changes, autoplay, Recently played, search and album/artist cascade hiding. Album queues retain original positions for next/previous and shuffle the whole visible order.

Simulator QA verified the global rows in Songs, search, album and artist pages, Settings toggle and no-op scan, visible album Play, and no-lyrics playback staying on its song beyond nine seconds in both modes. Search also exposed album/artist hiding rows for a hidden-only match. All three required screenshots were recaptured at 1206×2622 and visually checked. Final visual QA fixed the new singular album count and sized the new Settings explanation to one line. The implementation report was appended. No dependencies or commits; task-owned Metro on 8083 stopped and 8765 left alone.
