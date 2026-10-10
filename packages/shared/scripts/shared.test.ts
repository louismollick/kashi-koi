import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fingerprint,
  decoyText,
  dropInvalidDecoys,
  breakdownDraftJsonSchema,
  breakdownDraftSchema,
  breakdownSchema,
  validateBreakdown,
  lyricLines,
  pickEntry,
  songAnalysisDraftJsonSchema,
  songAnalysisDraftSchema,
  songAnalysisSchema,
  validateAnalysis,
  type SongAnalysisDraft,
  type StructuredLyrics,
} from '../src/index.ts';

/** Small valid swaps for fixtures; behavior tests use explicit decoys. */
const testDecoys = (translation: string) => [
  { from: translation.slice(0, 1), to: 'X', reason: 'Changes the sentence.' },
  { from: translation.slice(0, 1), to: 'Y', reason: 'Changes the sentence differently.' },
];

const draft: SongAnalysisDraft = {
  title: 'An open window',
  summary: 'The speaker watches the morning sky. Counting clouds gives them time to think.',
  speaker: 'Someone at a window',
  addressee: 'unclear',
  lines: ['The morning window', 'I count the clouds', 'The morning window'],
  sentences: [
    {
      start: 0,
      end: 1,
      translation: 'At the morning window, I count the clouds.',
      decoys: testDecoys('At the morning window, I count the clouds.'),
    },
    { start: 2, end: 2, translation: 'The morning window.', decoys: testDecoys('The morning window.') },
  ],
};

test('fingerprints use the known UTF-8 SHA-256 vector and v1 prefix', () => {
  assert.equal(
    fingerprint(['朝の窓', '雲を数える']),
    'v1:4590c4cd6cdf155b6283c474dac1c043a9e88f055442fab8e4d5898cecca4645',
  );
  assert.equal(fingerprint([]), 'v1:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(fingerprint(['朝の窓', '雲を数える']), fingerprint(['朝の窓', '雲を数える']));
});

test('decoys replace the first occurrence literally, and may share a span or use disjoint spans', () => {
  const translation = 'I left the letter, then left the station.';
  const decoy = { from: 'left', to: '$& returned to', reason: 'Changes the action.' };
  assert.equal(decoyText(translation, decoy), 'I $& returned to the letter, then left the station.');
  assert.equal(decoyText(translation, { ...decoy, from: 'missing' }), translation);
  for (const from of ['left', 'station']) {
    assert.deepEqual(
      validateAnalysis(
        {
          ...draft,
          sentences: [
            { start: 0, end: 2, translation, decoys: [decoy, { from, to: 'home', reason: 'Changes the location.' }] },
          ],
        },
        3,
      ),
      [],
    );
  }
});

test('decoy validation rejects missing phrases, whole answers, overlaps, duplicate options and empty fields', () => {
  const translation = 'I left the station.';
  const valid = { from: 'left', to: 'entered', reason: 'Changes the action.' };
  const invalid = [
    [valid],
    [valid, valid, valid],
    [valid, valid],
    [valid, { ...valid, from: 'missing' }],
    [valid, { ...valid, from: translation }],
    [valid, { ...valid, to: 'left' }],
    [valid, { ...valid, from: 'left the', to: 'passed' }],
    [valid, { ...valid, from: 'the station', to: '' }],
    [valid, { ...valid, reason: ' ' }],
    [valid, { from: 'the station', to: 'the 駅', reason: 'Changes the place.' }],
  ];
  for (const decoys of invalid)
    assert.notDeepEqual(validateAnalysis({ ...draft, sentences: [{ start: 0, end: 2, translation, decoys }] }, 3), []);
  // Different edits can produce the same full string even with distinct disjoint spans.
  assert.notDeepEqual(
    validateAnalysis(
      {
        ...draft,
        sentences: [
          {
            start: 0,
            end: 2,
            translation: 'ab',
            decoys: [
              { from: 'a', to: 'aa', reason: 'One extra letter.' },
              { from: 'b', to: 'ab', reason: 'Same result.' },
            ],
          },
        ],
      },
      3,
    ),
    [],
  );
});

const breakdown = {
  chunks: [
    { text: '窓を', steps: [{ japanese: '窓', reading: 'まど', english: 'window' }], note: 'The object.' },
    {
      text: '開けた',
      steps: [
        { japanese: '開ける', reading: 'あける', english: 'to open' },
        { japanese: '開けた', reading: 'あけた', english: 'opened' },
      ],
      note: '',
    },
  ],
};

test('decoy reasons may quote Japanese while decoy phrases stay English', () => {
  const translation = "I can't sleep at the station.";
  const decoys = [
    { from: "can't sleep", to: 'can sleep', reason: 'ない makes it negative.' },
    { from: 'at the station', to: 'to the station', reason: 'で marks where it happens.' },
  ];
  assert.deepEqual(validateAnalysis({ ...draft, sentences: [{ start: 0, end: 2, translation, decoys }] }, 3, true), []);
});

test('breakdown schema is strict and coverage ignores whitespace, punctuation and symbols', () => {
  assert.deepEqual(validateBreakdown(breakdown, '窓を\n 開けた。♪'), []);
  assert.deepEqual(breakdownDraftSchema.parse(breakdown), breakdown);
  assert.equal(breakdownSchema.safeParse(breakdown).success, false);
  assert.equal(
    breakdownSchema.safeParse({ ...breakdown, fingerprint: 'v1:test', start: 0, model: 'test', createdAt: 'today' })
      .success,
    true,
  );
  assert.equal(checkStrictObjects(breakdownDraftJsonSchema), 3);
  assert.equal(breakdownDraftSchema.safeParse({ ...breakdown, extra: true }).success, false);
});

test('breakdown validation requires ordered coverage, at least one chunk and 1 to 4 steps', () => {
  for (const chunks of [
    [],
    [...breakdown.chunks].reverse(),
    breakdown.chunks.slice(1),
    [{ ...breakdown.chunks[0], steps: [] }, breakdown.chunks[1]],
    [{ ...breakdown.chunks[0], steps: Array(5).fill(breakdown.chunks[0]?.steps[0]) }, breakdown.chunks[1]],
  ])
    assert.notDeepEqual(validateBreakdown({ chunks }, '窓を開けた'), []);
  for (const reading of ['mado', 'マド', '窓', 'ま ど', 'まどー'])
    assert.notDeepEqual(
      validateBreakdown(
        { chunks: [{ text: '窓', steps: [{ japanese: '窓', english: 'window', reading }], note: '' }] },
        '窓',
      ),
      [],
    );
  assert.deepEqual(
    validateBreakdown(
      { chunks: [{ text: 'あ', steps: [{ japanese: 'あ', reading: '', english: 'ah' }], note: '' }] },
      'あ',
    ),
    [],
  );
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
    schemaVersion: 2,
    fingerprint: fingerprint(['朝の窓', '雲を数える', '朝の窓']),
    model: 'test-model',
    createdAt: '2026-10-08T00:00:00Z',
  };
  assert.deepEqual(songAnalysisSchema.parse(analysis), analysis);
  assert.equal(songAnalysisSchema.safeParse({ ...analysis, schemaVersion: 1 }).success, false);
  assert.equal(songAnalysisDraftSchema.safeParse({ ...draft, extra: 'unexpected' }).success, false);
});

test('validateAnalysis accepts contiguous inclusive coverage and empty input', () => {
  assert.deepEqual(validateAnalysis(draft, 3), []);
  assert.deepEqual(validateAnalysis({ ...draft, lines: [], sentences: [] }, 0), []);
});

test('validateAnalysis rejects incorrect line counts, gaps, overlaps, order and incomplete coverage', () => {
  assert.match(validateAnalysis({ ...draft, lines: draft.lines.slice(1) }, 3).join('\n'), /line translations/);
  const invalidRanges = [
    [
      {
        start: 1,
        end: 2,
        translation: 'Gap before the first sentence',
        decoys: testDecoys('Gap before the first sentence'),
      },
    ],
    [
      { start: 0, end: 0, translation: 'First line', decoys: testDecoys('First line') },
      { start: 2, end: 2, translation: 'Gap in the middle', decoys: testDecoys('Gap in the middle') },
    ],
    [
      { start: 0, end: 1, translation: 'First two lines', decoys: testDecoys('First two lines') },
      { start: 1, end: 2, translation: 'Overlap', decoys: testDecoys('Overlap') },
    ],
    [draft.sentences[1], draft.sentences[0]],
    [{ start: 0, end: 1, translation: 'Missing the last line', decoys: testDecoys('Missing the last line') }],
    [],
    [{ start: 0, end: 3, translation: 'Past the last line', decoys: testDecoys('Past the last line') }],
    [
      { start: 0, end: 0, translation: 'First line', decoys: testDecoys('First line') },
      { start: 1, end: 0, translation: 'Reversed range', decoys: testDecoys('Reversed range') },
    ],
  ];
  for (const sentences of invalidRanges)
    assert.notDeepEqual(validateAnalysis({ ...draft, sentences }, 3), [], JSON.stringify(sentences));
});

test('validateAnalysis rejects non-integer ranges and empty text fields', () => {
  assert.notDeepEqual(
    validateAnalysis(
      { ...draft, sentences: [{ start: 0.5, end: 2, translation: 'A sentence', decoys: testDecoys('A sentence') }] },
      3,
    ),
    [],
  );
  for (const value of ['', ' \n\t ']) {
    for (const field of ['title', 'summary', 'speaker', 'addressee'])
      assert.match(validateAnalysis({ ...draft, [field]: value }, 3).join('\n'), /Must not be empty/);
    assert.notDeepEqual(validateAnalysis({ ...draft, lines: [value, ...draft.lines.slice(1)] }, 3), []);
    assert.notDeepEqual(validateAnalysis({ ...draft, sentences: [{ start: 0, end: 2, translation: value }] }, 3), []);
  }
  assert.notDeepEqual(validateAnalysis(null, 3), []);
  assert.notDeepEqual(validateAnalysis(draft, -1), []);
});

/** Inspect every nested schema object, including sentence and decoy array items. */
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
  ]);
});

test('stored analyses accept zero or two valid decoys, and invalid decoys can be dropped', () => {
  const empty = { ...draft, sentences: draft.sentences.map((sentence) => ({ ...sentence, decoys: [] })) };
  assert.deepEqual(validateAnalysis(empty, 3), []);
  assert.match(validateAnalysis(empty, 3, true).join('\n'), /exactly 2 decoys/);
  const [first, second] = draft.sentences;
  assert.ok(first && second);
  const metadata = { schemaVersion: 2, fingerprint: 'test', model: 'test', createdAt: 'today' };
  assert.ok(songAnalysisSchema.safeParse({ ...empty, ...metadata }).success);
  for (const decoys of [
    [{ from: 'missing', to: 'home', reason: 'Wrong phrase' }],
    [{ from: 'I', to: '', reason: '' }],
    null,
  ]) {
    const invalid: Record<string, unknown> = { ...draft, sentences: [{ ...first, decoys }, second] };
    assert.equal(songAnalysisSchema.safeParse({ ...invalid, ...metadata }).success, false);
    const cleaned = songAnalysisDraftSchema.parse(dropInvalidDecoys(invalid));
    assert.deepEqual(cleaned.sentences[0]?.decoys, []);
    assert.deepEqual(cleaned.sentences[1], draft.sentences[1]);
    assert.deepEqual(validateAnalysis(cleaned, 3), []);
  }
});

test('breakdown steps with kanji or the repetition mark require readings', () => {
  for (const japanese of ['窓', '開ける', '々'])
    assert.match(
      validateBreakdown(
        { chunks: [{ text: japanese, steps: [{ japanese, reading: '', english: 'test' }], note: '' }] },
        japanese,
      ).join('\n'),
      /needs a reading for kanji/,
    );
});
