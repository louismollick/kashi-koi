# UI shell fix pass

The implementation brief authorizes A1-A7 and B1-B7. Keep the architecture, do not commit, and work only in this project.

1. Add store regression sequences for review IDs, moved clips, locked answers, duplicate moves, whole-song grading, and absolute undo expiry. Verify they fail against the current bugs and pass after the fixes.
2. Apply segmented ruby, stepped bevels and solid icon controls, transport glyphs, cream NICE, bottom-anchored answers and larger mascot, lyric fades, song-specific fixtures, and review pluralization. Verify strict types and inspect native screenshots against the banner.
3. Run the iOS app, verify feedback pause/resume and key edit/undo flows, replace all ten screenshots, and append item-level evidence to the implementation report. Run typecheck and the test suite.

Deliberate review: recorded answer choices must survive revisiting a miss, duplicate-move guards must include later lines, selecting the unchanged edit line must preserve its state, and an expired toast must be hidden on the first render after returning. Whole-song grading must also list unanswered lines as misses. No new dependency is needed for fades because SVG gradients are already available.

Baseline: strict typecheck and eight tests passed. iPhone 17 Pro on iOS 26.5 is booted with the existing development app and Metro on port 8083.

## Completed

All three steps passed. Seventeen tests cover the requested store sequences and related result-ID/fixture cases. The final typecheck passed; source has no explicit any or em dash. Native QA verified paused feedback on ordinary and final lines, recorded feedback on revisits, moved clips accepting another answer, disabled occupied edit rows, expired undo after navigation, whole-song grading, and singular review copy.

All ten screenshots were replaced after the final code fix and inspected. Final visual review caught an overbroad fill replacement on Edit rows; the coral current-line highlight was restored while preview controls kept slate fill. The report contains A1-A7/B1-B7 source locations and verification. No commits, pushes, or dependency changes.
