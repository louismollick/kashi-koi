import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fingerprint,
  lyricLines,
  pickEntry,
  songAnalysisDraftJsonSchema,
  songAnalysisDraftSchema,
  songAnalysisSchema,
  validateAnalysis,
  type SongAnalysisDraft,
  type StructuredLyrics,
} from '../src/index.ts';

const draft: SongAnalysisDraft = {
  title: 'An open window',
  summary: 'The speaker watches the morning sky. Counting clouds gives them time to think.',
  speaker: 'Someone at a window',
  addressee: 'unclear',
  lines: ['The morning window', 'I count the clouds', 'The morning window'],
  sentences: [
    { start: 0, end: 1, translation: 'At the morning window, I count the clouds.' },
    { start: 2, end: 2, translation: 'The morning window.' },
  ],
  notes: [{ line: 0, text: 'The speaker does not name themself.' }],
};

test('fingerprints use the known UTF-8 SHA-256 vector and v1 prefix', () => {
  assert.equal(
    fingerprint(['朝の窓', '雲を数える']),
    'v1:4590c4cd6cdf155b6283c474dac1c043a9e88f055442fab8e4d5898cecca4645',
  );
  assert.equal(fingerprint([]), 'v1:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(fingerprint(['朝の窓', '雲を数える']), fingerprint(['朝の窓', '雲を数える']));
});

test('fingerprints normalize NFC and retain occurrence order, repetition and whitespace', () => {
  assert.equal(fingerprint(['が見える']), fingerprint(['か\u3099見える']));
  assert.notEqual(fingerprint(['朝の窓', '雲を数える']), fingerprint(['雲を数える', '朝の窓']));
  assert.notEqual(fingerprint(['朝の窓']), fingerprint(['朝の窓', '朝の窓']));
  assert.notEqual(fingerprint(['朝の窓']), fingerprint([' 朝の窓 ']));
});

test('pickEntry prefers Japanese synced entries and preserves fallback order', () => {
  const english: StructuredLyrics = { synced: true, lang: 'en', line: [] };
  const japanese: StructuredLyrics = { synced: true, lang: 'JPN', line: [] };
  const unsynced: StructuredLyrics = { synced: false, lang: 'ja', line: [] };
  assert.equal(pickEntry([unsynced, english, japanese]), japanese);
  assert.equal(pickEntry([english, { synced: true, line: [] }]), english);
  assert.equal(pickEntry([unsynced]), undefined);
  assert.equal(pickEntry([]), undefined);
  const ja = { ...japanese, lang: 'JA' };
  assert.equal(pickEntry([english, ja]), ja);
});

test('pickEntry ignores pronunciation layers even when only main lyrics have an unknown language', () => {
  const main: StructuredLyrics = { synced: true, lang: 'und', kind: 'main', line: [{ start: 0, value: '朝の窓' }] };
  const pronunciation: StructuredLyrics = {
    synced: true,
    lang: 'ja',
    kind: 'pronunciation',
    line: [{ start: 0, value: 'あさのまど' }],
  };
  assert.equal(pickEntry([pronunciation, main]), main);
  assert.equal(pickEntry([pronunciation]), undefined);
});

test('lyricLines sorts adjusted timestamps, trims, drops blanks and retains repetitions and ties', () => {
  const entry: StructuredLyrics = {
    synced: true,
    offset: 1500,
    line: [
      { start: 7000, value: '朝の窓' },
      { start: 1000, value: ' 朝の窓 ' },
      { start: 3000, value: ' \n\t ' },
      { start: 5000, value: ' 雲を数える\n' },
      { start: 5000, value: '空が広い' },
    ],
  };
  assert.deepEqual(lyricLines(entry), ['朝の窓', '雲を数える', '空が広い', '朝の窓']);
  assert.deepEqual(lyricLines({ synced: true, line: [] }), []);
  for (const start of [undefined, NaN, Infinity, -Infinity])
    assert.throws(() => lyricLines({ synced: true, line: [{ start, value: '朝の窓' }] }), /Invalid synced lyrics/);
});

test('analysis schemas retain all draft fields and require server metadata only in the full schema', () => {
  assert.deepEqual(songAnalysisDraftSchema.parse(draft), draft);
  assert.equal(songAnalysisSchema.safeParse(draft).success, false);
  const analysis = {
    ...draft,
    schemaVersion: 1,
    fingerprint: fingerprint(['朝の窓', '雲を数える', '朝の窓']),
    model: 'test-model',
    createdAt: '2026-10-08T00:00:00Z',
  };
  assert.deepEqual(songAnalysisSchema.parse(analysis), analysis);
  assert.equal(songAnalysisSchema.safeParse({ ...analysis, schemaVersion: 2 }).success, false);
  assert.equal(songAnalysisDraftSchema.safeParse({ ...draft, extra: 'unexpected' }).success, false);
});

test('validateAnalysis accepts contiguous inclusive coverage and empty input', () => {
  assert.deepEqual(validateAnalysis(draft, 3), []);
  assert.deepEqual(validateAnalysis({ ...draft, lines: [], sentences: [], notes: [] }, 0), []);
});

test('validateAnalysis rejects incorrect line counts, gaps, overlaps, order and incomplete coverage', () => {
  assert.match(validateAnalysis({ ...draft, lines: draft.lines.slice(1) }, 3).join('\n'), /line translations/);
  const invalidRanges = [
    [{ start: 1, end: 2, translation: 'Gap before the first sentence' }],
    [
      { start: 0, end: 0, translation: 'First line' },
      { start: 2, end: 2, translation: 'Gap in the middle' },
    ],
    [
      { start: 0, end: 1, translation: 'First two lines' },
      { start: 1, end: 2, translation: 'Overlap' },
    ],
    [draft.sentences[1], draft.sentences[0]],
    [{ start: 0, end: 1, translation: 'Missing the last line' }],
    [],
    [{ start: 0, end: 3, translation: 'Past the last line' }],
    [
      { start: 0, end: 0, translation: 'First line' },
      { start: 1, end: 0, translation: 'Reversed range' },
    ],
  ];
  for (const sentences of invalidRanges)
    assert.notDeepEqual(validateAnalysis({ ...draft, sentences }, 3), [], JSON.stringify(sentences));
});

test('validateAnalysis rejects invalid note indexes, non-integer ranges and empty text fields', () => {
  for (const line of [-1, 3, 1.5])
    assert.notDeepEqual(validateAnalysis({ ...draft, notes: [{ line, text: 'A note' }] }, 3), []);
  assert.notDeepEqual(
    validateAnalysis({ ...draft, sentences: [{ start: 0.5, end: 2, translation: 'A sentence' }] }, 3),
    [],
  );
  for (const value of ['', ' \n\t ']) {
    for (const field of ['title', 'summary', 'speaker', 'addressee'])
      assert.match(validateAnalysis({ ...draft, [field]: value }, 3).join('\n'), /Must not be empty/);
    assert.notDeepEqual(validateAnalysis({ ...draft, lines: [value, ...draft.lines.slice(1)] }, 3), []);
    assert.notDeepEqual(validateAnalysis({ ...draft, sentences: [{ start: 0, end: 2, translation: value }] }, 3), []);
    assert.notDeepEqual(validateAnalysis({ ...draft, notes: [{ line: 0, text: value }] }, 3), []);
  }
  assert.notDeepEqual(validateAnalysis(null, 3), []);
  assert.notDeepEqual(validateAnalysis(draft, -1), []);
});

/** Inspect every nested schema object, including sentence and note array items. */
function checkStrictObjects(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((count, item) => count + checkStrictObjects(item), 0);
  if (!value || typeof value !== 'object') return 0;
  let count = 0;
  if ('type' in value && value.type === 'object') {
    assert.ok('additionalProperties' in value);
    assert.equal(value.additionalProperties, false);
    assert.ok('properties' in value && value.properties && typeof value.properties === 'object');
    assert.ok('required' in value);
    assert.deepEqual(value.required, Object.keys(value.properties));
    count += 1;
  }
  return count + Object.values(value).reduce<number>((total, child) => total + checkStrictObjects(child), 0);
}

test('draft JSON Schema has required properties and rejects extras on every object', () => {
  assert.equal(checkStrictObjects(songAnalysisDraftJsonSchema), 3);
  assert.deepEqual(Object.keys(songAnalysisDraftJsonSchema.properties ?? {}), [
    'title',
    'summary',
    'speaker',
    'addressee',
    'lines',
    'sentences',
    'notes',
  ]);
});
