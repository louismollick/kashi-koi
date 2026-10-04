# UI shell plan: Lo-Fi Pixel Harbor

Build the Kashi-Koi! iOS app's screens in Expo with fake data, styled after `docs/design/banner.png`. No Navidrome, no audio, no persistence yet. The goal is to nail the look and navigation on a real device before wiring services.

## Sources of truth

- **Product language:** `CONTEXT.md` (glossary). Use its terms in code (Line, Review list, Due line, New line, Clip review, Review mix, Run, Rank, Quiz toggle, Listen mode, Quiz mode, Combo).
- **Screens, copy, and behavior:** `mockups/round-7.html` (open it in a browser). Layout and copy come from there, with the changes listed under "Changes since round 7" below.
- **Styling only:** `docs/design/banner.png`. Copy its colors, pixel art, button sizing, and overall feel. Where the banner and round 7 disagree on content (progress bar in the player, arrows on due items, "N to review" copy), round 7 wins.

## Stack

- Expo (latest stable SDK; check `npm view expo version`), TypeScript strict, expo-router.
- `react-native-svg` for the pixel contour and icons, `react-native-reanimated` for small motion, `expo-image` for images, `zustand` for the fake app state.
- iOS only, portrait only, dark only.
- System font: San Francisco and Hiragino Sans. No bundled fonts.
- Icons: pixelarticons (MIT). Copy only the SVGs needed into a typed icon map rendered with react-native-svg.

## Look

### Colors (sampled from the banner)

| Token | Hex | Use |
|---|---|---|
| bg | `#16182a` | screen background, tab bar, player bottom bar |
| header | `#1e2038` | top band behind the logo |
| surface | `#1d1f35` | list cards, lyric cards |
| slate | `#272945` | secondary buttons (Songs) |
| coral | `#fb4a5e` | primary actions: Review card, Clips, active tab, badges, NEW tag |
| coralDeep | `#df475a` | coral pressed / Review card body |
| maroon | `#4a3441` | quiz answer buttons |
| greenDeep | `#1c6747` | correct answer fill |
| green | `#55ee9c` | lane hit, quiz toggle on, check mark |
| red | `#f95362` | lane miss |
| laneEmpty | `#555470` | lane segments not yet played |
| track | `#3e3d5b` | inactive tracks and dividers |
| cream | `#fbf8c6` | "NICE!" bubble |
| combo | `#ffc93c` | COMBO label and number |
| mini | `#f8f0f1` | mini player card (dark text on it) |
| text | `#f4f1ee` | primary text |
| muted | `#9a9cb8` | secondary text |

### Pixel contour

Every button, card, tag, toggle and the mini player uses one shared shape component (call it `PixelFrame`):

- Stepped corners: 2 notches per corner, 2pt per step. "Very slight": it should read as rounded-ish from arm's length and pixelated up close.
- A 1pt lighter edge along the top and a 1pt darker edge along the bottom (derived from the fill), like the banner's buttons.
- Drawn with react-native-svg, sized via onLayout, children rendered on top. No 9-slice images.
- Text inside stays the plain system font.

### Assets (`assets/` in the repo root, already present)

- `kashikoi-logo.png`: header logo (fish plus wordmark) on Home, Library, Review.
- `background.png`: Home hero, cropped to fill the top of Home and scrolling away with the page.
- `girl.png`: static mascot, fallback only.
- `animated-bobbing.png`, `animated-headbang.png`: 4×2 sprite sheets, 8 frames each, flat gray background. They need processing (below).

The art is high-res "fake pixel art", so normal smooth scaling is correct. No nearest-neighbor filtering.

### Sprite processing (one-off script, check it in)

Write `scripts/process-sprites.py` (Pillow) that:

1. Cuts each sheet into 8 frames. The sheets are 1774×887, so cells are 443.5px wide: compute cell bounds per cell, don't assume integers.
2. Removes the gray background by flood-filling from each cell's edges with a tolerance, so interior grays survive. Rod tips that bleed in from the neighboring cell must be discarded (keep only the largest connected component per cell).
3. Aligns frames on the chair. Bobbing is already within ~2px. Headbang drifts ~10px, so align on the chair and boots region (bottom of the sprite) so only the head and body move.
4. Writes `assets/sprites/bobbing.png` and `assets/sprites/headbang.png` as single-row strips with identical integer frame sizes and transparent backgrounds, plus the frame size in a small TS module.

### Mascot behavior

- A `Mascot` component renders a strip inside an overflow-hidden view and steps through frames: bobbing about 6 fps, headbang about 10 fps.
- **Bobbing** is the idle loop: Home hero and the quiz-on player between hits.
- **Headbang** plays continuously while the combo is 3 or more, and stops on a miss.
- The "NICE!" bubble pops on each correct answer. The COMBO label and number sit beside the mascot, as in the banner.
- The mascot does not appear on the quiz-off player.

## Navigation

Bottom tabs: **Home / Library / Review**, with pixelarticons icons and a coral badge on Review with the due count. The mini player sits above the tab bar on all three tabs and opens the player. The gear on Home opens a placeholder settings screen.

## Screens

Fake data: a handful of songs (the 夜明けのバス lyrics from the mockups), album covers as colored placeholders or bundled images, and a review list with 2 new lines and several due lines.

1. **Home.** The harbor hero with the logo header and the bobbing mascot on the dock. The coral Review card overlaps the bottom of the hero ("12 lines to review", "3 new from listening", a play button) and opens the Review tab. Then "Recently played" (covers with title, artist, and a small rank badge), the mini player, the tabs.
2. **Home, nothing due.** The Review card shrinks to a one-line "All caught up · next due tomorrow" bar. Make it reachable with a dev toggle in the fake store.
3. **Library.** Logo header, search field, Albums / Artists / Songs / Playlists segments, cover grid, mini player, tabs.
4. **Review.** Logo header. Two buttons: **Clips** (coral, primary, "12 lines · ~4 min") and **Songs** (slate, "6 songs · 24 min"). Then "New from listening" and "Due today" sections. Each item: cover, song and artist, the lyric line, and one **✎ Edit** button. NEW items carry the coral NEW tag. A collapsed "Later" row at the bottom. Mini player, tabs.
5. **Edit line** (sheet, opened from any review item and from clip review). Shows the song's lyrics around the line (about 4 before and 4 after), with the current line highlighted. Tap another line to move it; each line has a small ▶ (no-op for now). **Remove from review** at the bottom.
6. **Clip review.** Header shows ✕, the song title and "ミナミ · clip 3 of 12". The line card (NEW tag when new), the dimmed neighboring lines, an **Edit line** button, a big ▶ clip button, three answers, then "next in 9 days" and Next ▸ after answering.
7. **Player, quiz off.** Header: back chevron, song title, "artist · line 4 of 14", QUIZ toggle off. The line lane (tap a segment to jump to that line; it is the only progress indicator). A full lyrics scroll that follows the current line, with the current line as a card and earlier lines tappable. A small "● N lines from this song in review" counter, then the big coral **DIDN'T UNDERSTAND** button (two lines, centered, "adds this line to review" underneath). Tapping it shows an "✓ Added · N in review · UNDO" toast for 3 seconds. Bottom bar: cover, "1:12 / 3:58", ⏮ ⏸ ⏭.
8. **Player, quiz on.** Same frame. The lane (green hit, red miss, empty grey). The line card with furigana. The mascot row (bobbing or headbang), "NICE!" bubble, COMBO count. Three maroon answer buttons; the correct pick turns green with a check. Same bottom bar, no progress bar.
9. **Review mix toggle confirm.** On the quiz-on player during a review mix (subtitle "Review mix · song 2 of 6"), turning the toggle off shows: "Turn off quiz? You're in a review mix. The songs keep playing as a normal playlist, and lines you haven't answered yet stay due." with Keep quiz / Turn off.
10. **Results.** After a run: song, big rank letter with "NEW BEST · was B", hit / combo / reviews stats, missed lines listed with toggles on by default ("send to review"), Again and Next song buttons.

Fake interactions should work (toggle, tapping answers advances lines on a timer, combo counting, undo toast, edit sheet moves the line, remove works) so the feel can be judged.

## Changes since round 7

- Review items: the ↑ ↓ arrows are replaced by one Edit button that opens the Edit line view. Clip review's "Wrong line? ↑ earlier / ↓ later" is replaced by the same Edit line button.
- Removing a line from review lives in the Edit line view.
- The chibi is replaced by the pixel mascot sprites.

## Out of scope

Navidrome, audio playback, lock screen Live Activity, persistence, translations, Library detail screens, settings content, Android.

## Done when

- `npx tsc --noEmit` passes with no `any`.
- The app runs in the iOS simulator and every screen above is reachable.
- Screenshots of every screen are saved to `docs/screenshots/` for review.
- The sprite script runs from a clean checkout and regenerates `assets/sprites/`.
