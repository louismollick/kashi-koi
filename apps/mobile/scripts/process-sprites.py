#!/usr/bin/env python3
"""Extract transparent eight-frame strips, register the stationary chair and put frames in playback order.

Requires Pillow only. Originals are read-only. Run from any working directory.
"""
from collections import deque
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/sprites"
FRAME_SIZE = 464
# Enclosed gray regions at least this big are backdrop showing through, not shading.
ENCLOSED_GAP = 60
FRINGE_PASSES = 2
# Strip order per sheet. The headbang sheet is drawn out of order; this sweeps the head back to front and back.
ORDER = {"bobbing": [0, 1, 2, 3, 4, 5, 6, 7], "headbang": [3, 2, 0, 4, 1, 6, 7, 5]}


def neighbors(index, width, height):
    """Four-connected neighbors, without wrapping at row edges."""
    x, y = index % width, index // width
    if x: yield index - 1
    if x + 1 < width: yield index + 1
    if y: yield index - width
    if y + 1 < height: yield index + width


def flood(start, width, height, accept, seen):
    """Collect the four-connected region around `start` whose pixels pass `accept`."""
    seen[start] = 1
    pending, region = deque([start]), []
    while pending:
        point = pending.popleft()
        region.append(point)
        for adjacent in neighbors(point, width, height):
            if not seen[adjacent] and accept(adjacent):
                seen[adjacent] = 1
                pending.append(adjacent)
    return region


def isolate(cell, gray):
    """Clear the gray backdrop, the gray showing through the chair and the light fringe it leaves on outlines."""
    cell = cell.convert("RGBA")
    width, height = cell.size
    pixels = list(cell.getdata())
    clear = bytearray(width * height)

    def is_gray(index):
        rgb = pixels[index][:3]
        return max(rgb) - min(rgb) < 24 and max(abs(c - gray) for c in rgb) < 46

    # Every gray region touching the edge is backdrop. Enclosed ones are too when big and neutral
    # (the gaps between chair legs); small ones are shading on the face, socks and headphones.
    seen = bytearray(width * height)
    for start in range(width * height):
        if seen[start] or not is_gray(start): continue
        region = flood(start, width, height, is_gray, seen)
        edge = any(p % width in (0, width - 1) or p // width in (0, height - 1) for p in region)
        if not edge and len(region) >= ENCLOSED_GAP:
            mean = [sum(pixels[p][c] for p in region) / len(region) for c in range(3)]
            edge = max(mean) - min(mean) <= 8
        if edge:
            for p in region: clear[p] = 1

    # Keep the largest opaque shape, discarding neighboring cells' rod fragments.
    seen = bytearray(clear)
    largest = []
    for start in range(width * height):
        if seen[start]: continue
        region = flood(start, width, height, lambda p: not clear[p], seen)
        if len(region) > len(largest): largest = region
    keep = bytearray(width * height)
    for p in largest: keep[p] = 1

    # Peel outline pixels blended with the backdrop: light and unsaturated, next to a cleared pixel.
    for _ in range(FRINGE_PASSES):
        fringe = [p for p in largest if keep[p] and is_fringe(pixels[p][:3])
                  and any(not keep[q] for q in neighbors(p, width, height))]
        for p in fringe: keep[p] = 0

    cell.putalpha(Image.frombytes("L", cell.size, bytes(255 if k else 0 for k in keep)))
    # Transparent RGB is cleared too, so filtering cannot introduce gray halos.
    result = Image.new("RGBA", cell.size)
    result.paste(cell, (0, 0), cell.getchannel("A"))
    return result


def is_fringe(rgb):
    """Backdrop gray mixed into the dark outline: brighter than the outline, without the art's saturation."""
    return max(rgb) - min(rgb) < 40 and sum(rgb) / 3 > 72


def chair_anchor(frame):
    """Register the lower chair legs, excluding the moving head, rod and toe."""
    # The chair occupies x=55..250, y=320..430 in each original cell.
    region = frame.crop((45, 325, 250, 432))
    alpha = region.getchannel("A")
    dark = region.convert("L").point(lambda p: 255 if p < 65 else 0)
    return ImageChops.multiply(alpha, dark).filter(ImageFilter.GaussianBlur(1))


def align(frame, reference):
    """Search integer offsets against the chair/boots region of frame zero."""
    anchor = chair_anchor(frame)
    best = (float("inf"), 0, 0)
    # Blank padding prevents ImageChops.offset's wraparound entering the match.
    padded = Image.new("L", (245, 147))
    padded.paste(anchor, (20, 20))
    for dy in range(-16, 17):
        for dx in range(-16, 17):
            shifted = padded.crop((20 - dx, 20 - dy, 225 - dx, 127 - dy))
            histogram = ImageChops.difference(reference, shifted).histogram()
            error = sum(value * count for value, count in enumerate(histogram))
            candidate = (error, dx, dy)
            if candidate < best: best = candidate
    return best[1:]


def process(name, gray):
    sheet = Image.open(ROOT / f"assets/animated-{name}.png")
    frames = [isolate(sheet.crop((round(col * sheet.width / 4),
                                round(row * sheet.height / 2),
                                round((col + 1) * sheet.width / 4),
                                round((row + 1) * sheet.height / 2))), gray)
              for row in range(2) for col in range(4)]
    reference = chair_anchor(frames[0])
    offsets = [(0, 0)] + [align(frame, reference) for frame in frames[1:]]
    strip = Image.new("RGBA", (FRAME_SIZE * 8, FRAME_SIZE))
    for index, source in enumerate(ORDER[name]):
        dx, dy = offsets[source]
        strip.paste(frames[source], (index * FRAME_SIZE + 10 + dx, 10 + dy))
    strip.save(OUT / f"{name}.png", optimize=True)
    print(f"{name}: {FRAME_SIZE}x{FRAME_SIZE}, 8 frames, chair offsets {offsets}")
    return offsets


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {name: process(name, gray) for name, gray in (("bobbing", 200), ("headbang", 187))}
    (OUT / "metadata.ts").write_text(
        "// Generated by scripts/process-sprites.py. Do not edit by hand.\n"
        f"export const spriteFrames = {{ width: {FRAME_SIZE}, height: {FRAME_SIZE}, count: 8 }} as const;\n")
    (OUT / "alignment.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__": main()
