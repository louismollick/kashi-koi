import assert from 'node:assert/strict';
import test from 'node:test';
import { lyricLines, pickEntry, type StructuredLyrics } from '@kashi-koi/shared/lyrics';
import { toSongLyrics, pickEntry as mobilePickEntry } from '../src/navidrome/lyrics';

test('shared lyrics match every app timeline occurrence after sorting, blanks, offsets and repeated text', () => {
  const entry: StructuredLyrics = {
    synced: true,
    lang: 'ja',
    offset: 1500,
    line: [
      { start: 7000, value: '朝の窓' },
      { start: 1000, value: ' 朝の窓 ' },
      { start: 3000, value: ' \n\t ' },
      { start: 5000, value: ' 雲を数える ' },
      { start: 5000, value: '空が広い' },
    ],
  };
  const app = toSongLyrics('song', entry, 9000);
  const textById = new Map(app.lines.map((line) => [line.id, line.segments.map((segment) => segment.text).join('')]));
  assert.deepEqual(
    lyricLines(entry),
    app.timeline.map((occurrence) => textById.get(occurrence.lineId)),
  );
  assert.deepEqual(app.timeline, [
    { lineId: 'song:朝の窓', startMs: -500, endMs: 1500 },
    { lineId: 'song:雲を数える', startMs: 3500, endMs: 3500 },
    { lineId: 'song:空が広い', startMs: 3500, endMs: 5500 },
    { lineId: 'song:朝の窓', startMs: 5500, endMs: 9000 },
  ]);
  assert.equal(mobilePickEntry, pickEntry);
});
