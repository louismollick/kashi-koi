import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepped, steppedPolygon, tint } from '../src/shape';

/** Walk a `stepped` path (only M, H, V, Z) into its vertices. */
function pathVertices(d: string) {
  let x = 0,
    y = 0;
  const points: [number, number][] = [];
  for (const [, command, value, second] of d.matchAll(/([MHV])(-?\d+(?:\.\d+)?)(?: (-?\d+(?:\.\d+)?))?/g)) {
    if (command === 'M') {
      x = Number(value);
      y = Number(second);
    } else if (command === 'H') x = Number(value);
    else y = Number(value);
    points.push([x, y]);
  }
  return points;
}

/** Resolve one polygon coordinate against an element extent. */
function resolve(value: string, extent: number) {
  if (value === '0') return 0;
  if (value === '100%') return extent;
  const calc = value.match(/^calc\(100% - (\d+)px\)$/);
  if (calc) return extent - Number(calc[1]);
  const px = value.match(/^(\d+)px$/);
  assert.ok(px, `unexpected coordinate ${value}`);
  return Number(px[1]);
}

for (const [steps, size] of [
  [2, 2],
  [3, 2],
  [3, 4],
] as const)
  test(`steppedPolygon(${steps}, ${size}) matches stepped() vertices at any element size`, () => {
    const polygon = steppedPolygon(steps, size);
    const body = polygon.match(/^polygon\((.*)\)$/)![1]!;
    const points = body.split(/, /).map((pair) => {
      const [x, y] = pair.match(/calc\([^)]*\)|\S+/g)!;
      return [x!, y!] as const;
    });
    for (const [width, height] of [
      [120, 48],
      [80, 80],
      [301, 57],
    ] as const) {
      const expected = pathVertices(stepped(0, 0, width, height, steps, size));
      // The path ends back on its start point; the polygon leaves that implicit.
      expected.pop();
      assert.deepEqual(
        points.map(([x, y]) => [resolve(x, width), resolve(y, height)]),
        expected,
      );
    }
  });

test('steppedPolygon uses px offsets and calc for far edges', () => {
  assert.equal(
    steppedPolygon(1, 2),
    'polygon(2px 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 2px calc(100% - 2px), 0 calc(100% - 2px), 0 2px, 2px 2px)',
  );
});

test('tint mixes toward white and black', () => {
  assert.equal(tint('#000000', 0.5), '#808080');
  assert.equal(tint('#ffffff', -0.5), '#808080');
});
