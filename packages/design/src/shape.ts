/** Mix an opaque hex color toward white (amount > 0) or black (amount < 0). */
export function tint(color: string, amount: number) {
  const value = Number.parseInt(color.slice(1, 7), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255];
  const target = amount > 0 ? 255 : 0;
  return `#${channels
    .map((channel) =>
      Math.round(channel + (target - channel) * Math.abs(amount))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Rectangle path whose corners step inward `steps` times by `size` points. */
export function stepped(x0: number, y0: number, x1: number, y1: number, steps: number, size: number) {
  const cut = steps * size;
  let d = `M${x0 + cut} ${y0} H${x1 - cut}`;
  for (let i = 1; i <= steps; i++) d += ` V${y0 + i * size} H${x1 - (steps - i) * size}`;
  d += ` V${y1 - cut}`;
  for (let i = 1; i <= steps; i++) d += ` H${x1 - i * size} V${y1 - (steps - i) * size}`;
  d += ` H${x0 + cut}`;
  for (let i = 1; i <= steps; i++) d += ` V${y1 - i * size} H${x0 + (steps - i) * size}`;
  d += ` V${y0 + cut}`;
  for (let i = 1; i <= steps; i++) d += ` H${x0 + i * size} V${y0 + (steps - i) * size}`;
  return `${d} Z`;
}

/**
 * `stepped` as a CSS `polygon(...)` for `clip-path`, with offsets in px from each edge and `calc(100% - Npx)` for the
 * right and bottom, so an element of any size gets the same corners without being measured. Vertices follow the same
 * order as the `stepped` path.
 */
export function steppedPolygon(steps: number, size: number) {
  const cut = steps * size;
  // Offsets measured from the left/top edge, or from the right/bottom edge.
  const near = (n: number) => (n ? `${n}px` : '0'),
    far = (n: number) => (n ? `calc(100% - ${n}px)` : '100%');
  const points = [`${near(cut)} ${near(0)}`, `${far(cut)} ${near(0)}`];
  for (let i = 1; i <= steps; i++)
    points.push(`${far((steps - i + 1) * size)} ${near(i * size)}`, `${far((steps - i) * size)} ${near(i * size)}`);
  points.push(`${far(0)} ${far(cut)}`);
  for (let i = 1; i <= steps; i++)
    points.push(`${far(i * size)} ${far((steps - i + 1) * size)}`, `${far(i * size)} ${far((steps - i) * size)}`);
  points.push(`${near(cut)} ${far(0)}`);
  for (let i = 1; i <= steps; i++)
    points.push(`${near((steps - i + 1) * size)} ${far(i * size)}`, `${near((steps - i) * size)} ${far(i * size)}`);
  points.push(`${near(0)} ${near(cut)}`);
  for (let i = 1; i <= steps; i++)
    points.push(`${near(i * size)} ${near((steps - i + 1) * size)}`, `${near(i * size)} ${near((steps - i) * size)}`);
  // The last vertex repeats the first; the path closes with Z instead.
  points.pop();
  return `polygon(${points.join(', ')})`;
}
