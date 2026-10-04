# UI shell implementation

The supplied `ui-shell-plan.md` was the approved implementation brief. Work stayed in this repo and was not committed.

1. Expo SDK 57, strict TypeScript, router, and sprite extraction are complete. Regeneration is deterministic, all frames have transparency, and chair registration was visually and numerically checked.
2. Shared SVG contour/icons, Zustand fixtures, all ten screen states, and their interactions are complete. Typecheck and eight fake-state tests pass.
3. Native iPhone 17 Pro build and simulator QA are complete. All ten screenshots are saved. The iOS bundle export passed.

Deliberate review caught and fixed a selected-tab highlight changing under the Edit modal, removing the current clip failing to advance, and replay/replacement losing the original mix quiz setting. Duplicate lost marks now show confirmation without duplicating or removing a pre-existing review line.

See `implementation-report.md` for file/version inventory, screenshot paths, asset findings, compatibility choices, and measured verification.
