#!/bin/sh
# Regenerates the WebP copies of the iOS art in src/assets (about a sixth of the PNG size). Run from apps/web after
# changing apps/mobile/assets or packages/design/sprites. Needs cwebp (brew install webp).
set -e
M=../mobile/assets
S=../../packages/design/sprites
cwebp -quiet -q 88 -m 6 "$M/background.png" -o src/assets/background.webp
cwebp -quiet -q 90 -m 6 -alpha_q 100 "$M/girl.png" -o src/assets/girl.webp
cwebp -quiet -q 90 -m 6 -alpha_q 100 -resize 760 0 "$M/kashikoi-logo.png" -o src/assets/kashikoi-logo.webp
cwebp -quiet -q 90 -m 6 -alpha_q 100 "$S/bobbing.png" -o src/assets/bobbing.webp
cwebp -quiet -q 90 -m 6 -alpha_q 100 "$S/headbang.png" -o src/assets/headbang.webp
