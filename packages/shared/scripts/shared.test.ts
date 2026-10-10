import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fingerprint,
  decoySentence,
  quizErrors,
  validateQuizzes,
  analysisAdvice,
  dropInvalidQuizzes,
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
const testQuiz = (translation: string) => ({
  phrase: translation.slice(0, 1),
  decoys: [
    { phrase: 'X', reason: 'Changes the sentence.' },
    { phrase: 'Y', reason: 'Changes the sentence differently.' },
  ],
});

const draft: SongAnalysisDraft = {
  title: 'An open window',
  about: 'The speaker watches the morning sky. Counting clouds gives them time to think.',
  lines: ['The morning window', 'I count the clouds', 'The morning window'],
  sentences: [
    {
      start: 0,
      end: 1,
      translation: 'At the morning window, I count the clouds.',
      quiz: testQuiz('At the morning window, I count the clouds.'),
    },
    { start: 2, end: 2, translation: 'The morning window.', quiz: testQuiz('The morning window.') },
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

test('decoy sentences replace only the first occurrence and preserve literal replacement text', () => {
  const translation = 'I left the letter, then left the station.';
  assert.equal(
    decoySentence(translation, 'left', { phrase: '$& returned to', reason: 'Wrong tense.' }),
    'I $& returned to the letter, then left the station.',
  );
  assert.equal(decoySentence(translation, 'missing', { phrase: 'home', reason: 'Wrong phrase.' }), translation);
});

const quiz = {
  phrase: "can't sleep",
  decoys: [
    { phrase: 'can sleep', reason: 'ない makes it negative.' },
    { phrase: 'could not sleep', reason: 'The ending is not past tense.' },
  ],
};
const sentence = { translation: "I can't sleep at the station.", quiz };

test('quiz validation accepts null and Japanese quotations in reasons', () => {
  assert.deepEqual(quizErrors(sentence, 0, ['駅で眠れない']), []);
  assert.deepEqual(quizErrors({ ...sentence, quiz: null }, 0, ['English only']), []);
  assert.deepEqual(quizErrors({ ...sentence, quiz: null }, 0, ['駅']), []);
});

test('quiz validation rejects invalid gap phrases, decoys and quizzes on non-Japanese lines', () => {
  for (const invalid of [
    { ...quiz, phrase: '' },
    { ...quiz, phrase: 'missing' },
    { ...quiz, phrase: sentence.translation },
    { ...quiz, decoys: [] },
    { ...quiz, decoys: quiz.decoys.slice(0, 1) },
    { ...quiz, decoys: [...quiz.decoys, quiz.decoys[0]] },
    { ...quiz, decoys: [quiz.decoys[0], { phrase: 'CAN SLEEP', reason: 'Duplicate.' }] },
    { ...quiz, decoys: [quiz.decoys[0], { phrase: "CAN'T SLEEP", reason: 'Same answer.' }] },
    { ...quiz, decoys: [quiz.decoys[0], { phrase: ' ', reason: 'Empty.' }] },
    { ...quiz, decoys: [quiz.decoys[0], { phrase: '眠れる', reason: 'Japanese.' }] },
    { ...quiz, decoys: [quiz.decoys[0], { phrase: 'sleep', reason: '' }] },
    { phrase: '眠る', decoys: quiz.decoys },
    { phrase: 'sleep' },
    [],
    undefined,
  ])
    assert.notDeepEqual(quizErrors({ ...sentence, quiz: invalid }, 0, ['駅で眠れない']), []);
  assert.match(quizErrors(sentence, 0, ['English only']).join('\n'), /null without Japanese/);
  assert.match(quizErrors(sentence, 0, ["眠れない CAN'T SLEEP"]).join('\n'), /already shown/);
});

const breakdown = {
  chunks: [
    {
      text: '窓を',
      reading: 'まどを',
      english: ['the window'],
      steps: [{ japanese: '窓', reading: 'まど', english: 'window' }],
      note: 'The object.',
    },
    {
      text: '開けた',
      reading: 'あけた',
      english: ['opened'],
      steps: [
        { japanese: '開ける', reading: 'あける', english: 'to open' },
        { japanese: '開けた', reading: 'あけた', english: 'opened' },
      ],
      note: '',
    },
  ],
};
const translation = 'I opened the window.';

test('breakdown schema is strict and coverage compares only Japanese characters', () => {
  assert.deepEqual(validateBreakdown(breakdown, 'Ah 窓を\n 開けた。♪ romaji', translation), []);
  assert.deepEqual(breakdownDraftSchema.parse(breakdown), breakdown);
  assert.equal(breakdownSchema.safeParse(breakdown).success, false);
  assert.equal(
    breakdownSchema.safeParse({ ...breakdown, fingerprint: 'v1:test', start: 0, model: 'test', createdAt: 'today' })
      .success,
    true,
  );
  assert.equal(checkStrictObjects(breakdownDraftJsonSchema), 3);
  assert.equal(breakdownDraftSchema.safeParse({ ...breakdown, extra: true }).success, false);
  assert.notDeepEqual(
    validateBreakdown(
      { chunks: [{ ...breakdown.chunks[0], text: '窓', reading: 'まど', english: [] }] },
      '窓ー々',
      translation,
    ),
    [],
  );
});

test('breakdown validation checks coverage, step counts, chunk readings and English spans', () => {
  for (const chunks of [
    [],
    [...breakdown.chunks].reverse(),
    breakdown.chunks.slice(1),
    [{ ...breakdown.chunks[0], steps: [] }, breakdown.chunks[1]],
    [{ ...breakdown.chunks[0], steps: Array(5).fill(breakdown.chunks[0]?.steps[0]) }, breakdown.chunks[1]],
    [{ ...breakdown.chunks[0], english: ['a window'] }, breakdown.chunks[1]],
    [{ ...breakdown.chunks[0], english: ['Opened'] }, breakdown.chunks[1]],
    [{ ...breakdown.chunks[0], reading: '' }, breakdown.chunks[1]],
  ])
    assert.notDeepEqual(validateBreakdown({ chunks }, '窓を開けた', translation), []);
  for (const reading of ['mado', 'マド', '窓', 'ま ど', 'まどー']) {
    assert.notDeepEqual(
      validateBreakdown(
        {
          chunks: [
            {
              text: '窓',
              reading,
              english: [],
              steps: [{ japanese: '窓', english: 'window', reading: 'まど' }],
              note: '',
            },
          ],
        },
        '窓',
        translation,
      ),
      [],
    );
    assert.notDeepEqual(
      validateBreakdown(
        {
          chunks: [
            {
              text: '窓',
              reading: 'まど',
              english: [],
              steps: [{ japanese: '窓', english: 'window', reading }],
              note: '',
            },
          ],
        },
        '窓',
        translation,
      ),
      [],
    );
  }
  assert.deepEqual(
    validateBreakdown(
      {
        chunks: [
          { text: 'あ', reading: '', english: [], steps: [{ japanese: 'あ', reading: '', english: 'ah' }], note: '' },
        ],
      },
      'あ',
      translation,
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
    schemaVersion: 3,
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
        quiz: testQuiz('Gap before the first sentence'),
      },
    ],
    [
      { start: 0, end: 0, translation: 'First line', quiz: testQuiz('First line') },
      { start: 2, end: 2, translation: 'Gap in the middle', quiz: testQuiz('Gap in the middle') },
    ],
    [
      { start: 0, end: 1, translation: 'First two lines', quiz: testQuiz('First two lines') },
      { start: 1, end: 2, translation: 'Overlap', quiz: testQuiz('Overlap') },
    ],
    [draft.sentences[1], draft.sentences[0]],
    [{ start: 0, end: 1, translation: 'Missing the last line', quiz: testQuiz('Missing the last line') }],
    [],
    [{ start: 0, end: 3, translation: 'Past the last line', quiz: testQuiz('Past the last line') }],
    [
      { start: 0, end: 0, translation: 'First line', quiz: testQuiz('First line') },
      { start: 1, end: 0, translation: 'Reversed range', quiz: testQuiz('Reversed range') },
    ],
  ];
  for (const sentences of invalidRanges)
    assert.notDeepEqual(validateAnalysis({ ...draft, sentences }, 3), [], JSON.stringify(sentences));
});

test('validateAnalysis rejects non-integer ranges and empty text fields', () => {
  assert.notDeepEqual(
    validateAnalysis(
      { ...draft, sentences: [{ start: 0.5, end: 2, translation: 'A sentence', quiz: testQuiz('A sentence') }] },
      3,
    ),
    [],
  );
  for (const value of ['', ' \n\t ']) {
    for (const field of ['title', 'about'])
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
  assert.equal(checkStrictObjects(songAnalysisDraftJsonSchema), 4);
  assert.deepEqual(Object.keys(songAnalysisDraftJsonSchema.properties ?? {}), ['title', 'about', 'lines', 'sentences']);
});

test('invalid quizzes can be dropped without hiding structural errors or changing other sentences', () => {
  const [first, second] = draft.sentences;
  assert.ok(first && second);
  const metadata = { schemaVersion: 3, fingerprint: 'test', model: 'test', createdAt: 'today' };
  const empty = { ...draft, sentences: draft.sentences.map((sentence) => ({ ...sentence, quiz: null })) };
  assert.ok(songAnalysisSchema.safeParse({ ...empty, ...metadata }).success);
  for (const quiz of [{ phrase: 'missing', decoys: [] }, [], { phrase: '', decoys: [] }]) {
    const invalid: Record<string, unknown> = { ...draft, sentences: [{ ...first, quiz }, second] };
    assert.deepEqual(validateAnalysis(invalid, 3), []);
    assert.notDeepEqual(validateQuizzes(invalid), []);
    assert.equal(songAnalysisSchema.safeParse({ ...invalid, ...metadata }).success, false);
    const cleaned = songAnalysisDraftSchema.parse(dropInvalidQuizzes(invalid));
    assert.equal(cleaned.sentences[0]?.quiz, null);
    assert.deepEqual(cleaned.sentences[1], second);
    assert.deepEqual(validateAnalysis(cleaned, 3), []);
  }
  assert.notDeepEqual(validateAnalysis(dropInvalidQuizzes({ ...draft, lines: [] }), 3), []);
});

test('source-aware dropping removes quizzes for English-only lyrics and already shown English', () => {
  const source = ['morning 朝', 'I count the clouds', 'English only'];
  const cleaned = songAnalysisDraftSchema.parse(dropInvalidQuizzes(draft, source));
  assert.equal(cleaned.sentences[1]?.quiz, null);
  assert.deepEqual(validateQuizzes(cleaned, source), []);
});

test('advice flags only long sentences and allows a repeated line to finish a clause', () => {
  const make = (ranges: [number, number][]) => ({
    ...draft,
    sentences: ranges.map(([start, end]) => ({ start, end, translation: 'A thought.', quiz: null })),
  });
  assert.deepEqual(analysisAdvice(make([[0, 3]])), ['Sentence 0 has 4 lines; prefer at most 3']);
  assert.deepEqual(analysisAdvice(make([[0, 2]])), []);
  const source = ['君に会えるけど', '帰りたい', '帰りたい'];
  const grouped = {
    ...make([
      [0, 1],
      [2, 2],
    ]),
    lines: source.map(() => 'A translated line'),
  };
  assert.deepEqual(validateAnalysis(grouped, source.length), []);
  assert.deepEqual(analysisAdvice(grouped), []);
});

test('breakdown chunks and steps with kanji or the repetition mark require readings', () => {
  for (const japanese of ['窓', '開ける', '々'])
    assert.match(
      validateBreakdown(
        {
          chunks: [
            { text: japanese, reading: '', english: [], steps: [{ japanese, reading: '', english: 'test' }], note: '' },
          ],
        },
        japanese,
        'test',
      ).join('\n'),
      /needs a reading for kanji/,
    );
});

test('Japanese coverage keeps dakuten while accepting NFC-equivalent source and chunk text', () => {
  const chunk = (text: string) => ({
    chunks: [
      { text, reading: '', english: [], steps: [{ japanese: 'が', reading: '', english: 'subject' }], note: '' },
    ],
  });
  assert.deepEqual(validateBreakdown(chunk('が'), 'か\u3099', 'subject'), []);
  assert.deepEqual(validateBreakdown(chunk('か\u3099'), 'が', 'subject'), []);
  assert.notDeepEqual(validateBreakdown(chunk('か'), 'か\u3099', 'subject'), []);
});

test('quiz phrases reject padding and duplicates after collapsing whitespace and case', () => {
  for (const phrase of [' can', 'can ', '\tcan', 'can\n', '', ' \t ']) {
    const padded = { ...quiz, phrase };
    assert.notDeepEqual(quizErrors({ translation: `I ${phrase} sleep.`, quiz: padded }, 0), []);
    const paddedDecoy = { ...quiz, decoys: [{ phrase, reason: 'Wrong.' }, quiz.decoys[1]] };
    assert.notDeepEqual(quizErrors({ ...sentence, quiz: paddedDecoy }, 0), []);
  }
  const sameButton = { ...quiz, phrase: 'can', decoys: [{ phrase: 'can ', reason: 'Wrong.' }, quiz.decoys[1]] };
  assert.notDeepEqual(quizErrors({ translation: 'I can sleep.', quiz: sameButton }, 0), []);
  for (const phrase of ["CAN'T  SLEEP", "can't\tsleep", 'CAN  SLEEP']) {
    const duplicate = { ...quiz, decoys: [quiz.decoys[0], { phrase, reason: 'Duplicate.' }] };
    assert.match(quizErrors({ ...sentence, quiz: duplicate }, 0).join('\n'), /collapsed whitespace/);
  }
});

test('English lyric checks match whole phrases rather than substrings', () => {
  const on = {
    translation: 'I carry on.',
    quiz: {
      phrase: 'on',
      decoys: [
        { phrase: 'off', reason: 'Wrong.' },
        { phrase: 'out', reason: 'Wrong.' },
      ],
    },
  };
  assert.deepEqual(quizErrors(on, 0, ['only 生きて']), []);
  assert.match(quizErrors(on, 0, ['生きて ON!']).join('\n'), /already shown/);
  const open = { ...on, translation: 'Please open your eyes.', quiz: { ...on.quiz, phrase: 'open your eyes' } };
  assert.match(quizErrors(open, 0, ['直ぐに open your eyes']).join('\n'), /already shown/);
  const output = { ...draft, lines: ['I carry on.'], sentences: [{ ...on, start: 0, end: 0 }] };
  assert.deepEqual(songAnalysisDraftSchema.parse(dropInvalidQuizzes(output, ['only 生きて'])), output);
  assert.equal(songAnalysisDraftSchema.parse(dropInvalidQuizzes(output, ['生きて on'])).sentences[0]?.quiz, null);
});

test('Japanese coverage retains half-width dakuten and handakuten through NFKC', () => {
  const chunk = (text: string) => ({
    chunks: [{ text, reading: '', english: [], steps: [{ japanese: text, reading: '', english: 'test' }], note: '' }],
  });
  for (const [source, fullWidth, unvoiced] of [
    ['ｶﾞ', 'ガ', 'ｶ'],
    ['ﾊﾟ', 'パ', 'ﾊ'],
  ]) {
    assert.ok(source && fullWidth && unvoiced);
    assert.deepEqual(validateBreakdown(chunk(source), source, 'test'), []);
    assert.deepEqual(validateBreakdown(chunk(fullWidth), source, 'test'), []);
    assert.deepEqual(validateBreakdown(chunk(source), fullWidth, 'test'), []);
    assert.match(validateBreakdown(chunk(unvoiced), source, 'test').join('\n'), /cover the sentence/);
  }
});
