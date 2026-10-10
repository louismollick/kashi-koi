import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { alignReading, isJapanese } from '../src/japanese/text';
import {
  pauseTranslations,
  resumeTranslations,
  prioritizeTranslations,
  setTranslator,
  setTranslationForeground,
  translationHint,
  type Translator,
} from '../src/japanese/translate';
import { appStore, getRunSummary } from '../src/store/appStore';
import {
  getAnswers,
  getLineText,
  getLyrics,
  hasTranslations,
  libraryStore,
  readyReviewLines,
  type Library,
  type Translations,
} from '../src/store/libraryStore';
import { songs } from './fixtures';
import { withSentences } from '../src/lyrics/sentences';
import type { Line } from '../src/types/domain';

const line = (id: string, text: string, translation?: string): Line => ({ id, segments: [{ text }], translation });
const makeLibrary = (texts: string[][], prefix = ''): Library => ({
  songs: texts.map((_, index) => ({ ...songs[0]!, id: `${prefix}${index}`, albumId: 'album' })),
  albums: [],
  artists: [],
  lyrics: Object.fromEntries(
    texts.map((texts, index) => [
      `${prefix}${index}`,
      withSentences({
        songId: `${prefix}${index}`,
        lines: texts.map((text, i) => line(`${index}:${i}`, text)),
        timeline: texts.map((_, i) => ({ lineId: `${index}:${i}`, startMs: i * 1000, endMs: (i + 1) * 1000 })),
      }),
    ]),
  ),
});
const fake: Translator = {
  translationStatus: async () => 'installed',
  prepareTranslation: async () => 'installed',
  tokenize: async (texts) => texts.map((surface) => [{ surface }]),
  translate: async (texts) => texts.map((text) => `EN: ${text}`),
};
beforeEach(async () => {
  await pauseTranslations(true);
  libraryStore.getState().setLibrary(makeLibrary([['一つ', '二つ', 'English']]));
  appStore.setState(appStore.getInitialState(), true);
  setTranslator(fake, async () => {});
  await setTranslationForeground(false);
});
afterEach(async () => {
  await pauseTranslations(true);
});

test('alignReading trims okurigana and matches internal kana', () => {
  assert.deepEqual(alignReading('駆け出せ', 'かけだせ'), [
    { text: '駆', reading: 'か' },
    { text: 'け' },
    { text: '出', reading: 'だ' },
    { text: 'せ' },
  ]);
  assert.deepEqual(alignReading('取り扱い', 'とりあつかい'), [
    { text: '取', reading: 'と' },
    { text: 'り' },
    { text: '扱', reading: 'あつか' },
    { text: 'い' },
  ]);
  assert.deepEqual(alignReading('食べ', 'たべ'), [{ text: '食', reading: 'た' }, { text: 'べ' }]);
  assert.deepEqual(alignReading('かな', 'かな'), [{ text: 'かな' }]);
  assert.deepEqual(alignReading('冷めたコーヒーを', 'さめたこおひいを'), [
    { text: '冷', reading: 'さ' },
    { text: 'めたコーヒーを' },
  ]);
  assert.deepEqual(alignReading('食べ', 'しょく'), [{ text: '食べ', reading: 'しょく' }]);
  assert.deepEqual(alignReading('朝'), [{ text: '朝' }]);
});

test('isJapanese includes kana, kanji and mixed text but excludes English and punctuation', () => {
  for (const text of ['かな', 'カナ', 'ｶﾅ', '日', 'Hello 世界']) assert.equal(isJapanese(text), true, text);
  for (const text of ['hello', '123', '!?。', 'ーー', '々', '〆', 'ー々〆', 'English 々', ''])
    assert.equal(isJapanese(text), false, text);
});

test('choices are distinct, shuffled and contain the translation with fewer choices when needed', () => {
  const lyrics = getLyrics('0');
  libraryStore.getState().setLyricsResult('0', 'synced', {
    ...lyrics,
    lines: [
      line('0:0', '一つ', 'one'),
      line('0:1', '二つ', 'two'),
      line('0:2', 'English', 'ignore'),
      line('extra', '三つ', 'two'),
    ],
  });
  const song = libraryStore.getState().bySong['0']!;
  assert.deepEqual(
    getAnswers(song, 0, () => 0.99).map((choice) => choice.text),
    ['one', 'two'],
  );
  assert.deepEqual(
    getAnswers(song, 0, () => 0).map((choice) => choice.text),
    ['two', 'one'],
  );
  libraryStore.getState().setLyricsResult('0', 'synced', {
    ...getLyrics('0'),
    lines: [line('0:0', '一つ', 'one'), line('0:1', '二つ', 'two'), line('0:2', '三つ', 'three')],
  });
  const three = getAnswers(song, 0, () => 0);
  assert.equal(three.length, 3);
  assert.equal(new Set(three.map((choice) => choice.text)).size, 3);
  assert.ok(three.some((choice) => choice.text === 'one'));
  libraryStore.getState().setLyricsResult('0', 'synced', { ...getLyrics('0'), lines: [line('0:0', '一つ', 'one')] });
  assert.deepEqual(getAnswers(song, 0), [{ text: 'one', parts: [{ text: 'one', marked: false }], correct: true }]);
  assert.deepEqual(getAnswers(song, 2), []);
});

test('English lines skip answering, grading and lost marks', () => {
  const library = makeLibrary([['Intro', '日本', 'English', 'かな']]);
  library.lyrics['0']!.lines[1]!.translation = 'Japan';
  library.lyrics['0']!.lines[3]!.translation = 'kana';
  library.lyrics = Object.fromEntries(
    Object.entries(library.lyrics).map(([id, lyrics]) => [id, withSentences(lyrics)]),
  );
  libraryStore.getState().setLibrary(library);
  appStore.getState().startSong('0');
  appStore.getState().setQuizToggle(true);
  appStore.getState().addLostMark();
  assert.equal(appStore.getState().reviewList.length, 0);
  appStore.getState().jumpToLine(2);
  appStore.getState().answer('Japan');
  assert.deepEqual(appStore.getState().run.answers, {});
  appStore.getState().jumpToLine(1);
  appStore.getState().answer('Japan');
  const choices = appStore.getState().run.choices['0:1'];
  appStore.getState().jumpToLine(2);
  appStore.getState().answer('English');
  assert.equal(appStore.getState().run.combo, 1);
  assert.equal(appStore.getState().run.answers['0:2'], undefined);
  appStore.getState().addLostMark();
  assert.equal(appStore.getState().reviewList.length, 0);
  appStore.getState().jumpToLine(1);
  appStore.getState().addLostMark();
  assert.equal(appStore.getState().reviewList[0]!.sentenceId, '0:1');
  appStore.getState().moveReviewLine(appStore.getState().reviewList[0]!.id, '0:2');
  assert.equal(appStore.getState().reviewList[0]!.sentenceId, '0:1');
  appStore.getState().sendToReview('0:2', true);
  assert.equal(appStore.getState().reviewList.length, 1);
  appStore.getState().jumpToLine(1);
  assert.equal(appStore.getState().run.choices['0:1'], choices);
  assert.deepEqual(
    getRunSummary(libraryStore.getState().bySong['0']!, appStore.getState().run).missed.map((line) => line.id),
    ['0:3'],
  );
  assert.equal(getRunSummary(libraryStore.getState().bySong['0']!, appStore.getState().run).total, 2);
});

test('quiz and review gates accept translated songs despite English lines and partial library readiness', () => {
  const library = makeLibrary([['日', 'English'], ['月'], ['English']]);
  library.lyrics['0']!.lines[0]!.translation = 'sun';
  library.lyrics = Object.fromEntries(
    Object.entries(library.lyrics).map(([id, lyrics]) => [id, withSentences(lyrics)]),
  );
  libraryStore.getState().setLibrary(library);
  assert.equal(hasTranslations('0'), true);
  assert.equal(hasTranslations('1'), false);
  assert.equal(hasTranslations('2'), false);
  appStore.getState().startSong('1');
  appStore.getState().setQuizToggle(true);
  assert.equal(appStore.getState().quizToggle, false);
  appStore.setState({
    reviewList: [
      { id: 'ready', songId: '0', sentenceId: '0:0', kind: 'new' },
      { id: 'wait', songId: '1', sentenceId: '1:0', kind: 'due', misses: 1 },
    ],
  });
  assert.equal(readyReviewLines(appStore.getState().reviewList).length, 1);
  appStore.getState().startClipReview();
  assert.deepEqual(appStore.getState().clipReview!.ids, ['ready']);
  const choice = appStore.getState().clipReview!.choices['0:0']![0]!;
  appStore.getState().answerClip(choice.text);
  assert.equal(appStore.getState().clipReview!.answers.ready?.correct, true);
});

test('queue persists unique Japanese texts and applies them across shared lines and rescans', async () => {
  libraryStore.getState().setLibrary(
    makeLibrary([
      ['日', '日', 'English'],
      ['日', '月'],
    ]),
  );
  const saved: Translations = {},
    batches: string[][] = [];
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        batches.push(texts);
        return fake.translate(texts);
      },
    },
    async (rows) => {
      Object.assign(saved, rows);
    },
  );
  await setTranslationForeground(true);
  assert.deepEqual(batches, [['日'], ['月']]);
  assert.equal(Object.keys(saved).length, 2);
  assert.equal(hasTranslations('0'), true);
  assert.equal(hasTranslations('1'), true);
  const fresh = makeLibrary([
    ['日', '日', 'English'],
    ['日', '月'],
  ]);
  libraryStore.getState().setLyricsResult('0', 'synced', fresh.lyrics['0']);
  assert.equal(hasTranslations('0'), true);
  await pauseTranslations(true);
  libraryStore.getState().setLibrary({ ...fresh, translations: saved });
  await resumeTranslations();
  assert.equal(hasTranslations('1'), true);
  assert.equal(batches.length, 2);
  assert.equal(getLineText(getLyrics('0').lines[0]!), '日');
});

test('playing song and album queue have priority over the library backlog', async () => {
  libraryStore.getState().setLibrary(makeLibrary([['日'], ['月'], ['星']]));
  const batches: string[][] = [];
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        batches.push(texts);
        return fake.translate(texts);
      },
    },
    async () => {},
  );
  appStore.getState().startSong('2');
  await setTranslationForeground(true);
  assert.deepEqual(batches, [['星'], ['日'], ['月']]);
  await pauseTranslations(true);
  const library = makeLibrary([['日'], ['月'], ['星']]);
  library.songs[0]!.albumId = 'other';
  library.lyrics = Object.fromEntries(
    Object.entries(library.lyrics).map(([id, lyrics]) => [id, withSentences(lyrics)]),
  );
  libraryStore.getState().setLibrary(library);
  batches.length = 0;
  appStore.getState().startAlbum('album');
  await resumeTranslations();
  assert.deepEqual(batches, [['月'], ['星'], ['日']]);
});

test('queue waits for the language pack and never starts work in the background', async () => {
  let installed = false,
    calls = 0;
  setTranslator(
    {
      ...fake,
      translationStatus: async () => (installed ? 'installed' : 'supported'),
      translate: async (texts) => {
        calls++;
        return fake.translate(texts);
      },
    },
    async () => {},
  );
  await setTranslationForeground(true);
  assert.equal(calls, 0);
  assert.equal(translationHint('0'), 'Download Japanese translation in Settings');
  await setTranslationForeground(false);
  installed = true;
  await resumeTranslations();
  assert.equal(calls, 0);
  await setTranslationForeground(true);
  assert.equal(calls, 1);
  assert.equal(hasTranslations('0'), true);
});

test('an interrupted batch is retried after foreground or restart without publishing stale work', async () => {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    entered = new Promise<void>((resolve) => {
      started = resolve;
    });
  let calls = 0,
    saves = 0;
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        calls++;
        started();
        await gate;
        return fake.translate(texts);
      },
    },
    async () => {
      saves++;
    },
  );
  const work = setTranslationForeground(true);
  await entered;
  const stop = setTranslationForeground(false);
  const restart = setTranslationForeground(true);
  release();
  await Promise.all([work, stop, restart]);
  assert.equal(calls, 2);
  assert.equal(saves, 1);
  assert.equal(hasTranslations('0'), true);
});

test('failed translation or persistence skips a batch for this run and retries on resume', async () => {
  libraryStore.getState().setLibrary(makeLibrary([['日'], ['月']]));
  let fail = true;
  const calls: string[] = [];
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        calls.push(texts[0]!);
        if (fail && texts[0] === '日') throw new Error('offline');
        return fake.translate(texts);
      },
    },
    async () => {},
  );
  await setTranslationForeground(true);
  assert.deepEqual(calls, ['日', '月']);
  assert.equal(hasTranslations('0'), false);
  assert.equal(hasTranslations('1'), true);
  assert.equal(translationHint('0'), 'No translations yet');
  fail = false;
  await resumeTranslations();
  assert.deepEqual(calls, ['日', '月', '日']);
  assert.equal(hasTranslations('0'), true);
});

test('translation settings persist and reset on logout', async () => {
  appStore.getState().toggleTranslations();
  appStore.setState({ translationPrompted: true });
  assert.equal(appStore.getState().showTranslations, true);
  appStore.setState(appStore.getInitialState(), true);
  assert.equal(appStore.getState().showTranslations, false);
  assert.equal(appStore.getState().translationPrompted, false);
});

test('a failed SQLite save never publishes translations and retries next run', async () => {
  let fail = true,
    calls = 0;
  setTranslator(fake, async () => {
    calls++;
    if (fail) throw new Error('SQLite failed');
  });
  await setTranslationForeground(true);
  assert.equal(calls, 1);
  assert.equal(hasTranslations('0'), false);
  fail = false;
  await resumeTranslations();
  assert.equal(calls, 2);
  assert.equal(hasTranslations('0'), true);
});

test('new playback priority changes the next batch while the serial worker is busy', async () => {
  libraryStore.getState().setLibrary(makeLibrary([['日'], ['月'], ['星']]));
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const calls: string[] = [];
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        calls.push(texts[0]!);
        if (calls.length === 1) {
          entered();
          await gate;
        }
        return fake.translate(texts);
      },
    },
    async () => {},
  );
  const work = setTranslationForeground(true);
  await started;
  appStore.getState().startSong('2');
  assert.equal(translationHint('2'), 'Translating…');
  release();
  await work;
  assert.deepEqual(calls, ['日', '星', '月']);
  assert.equal(libraryStore.getState().translationProgress, null);
});

test('a duplicate-text song uses the cache without a native call and preserves unchanged lines', async () => {
  libraryStore.getState().setLibrary(
    makeLibrary([
      ['日', 'English'],
      ['日', 'English'],
    ]),
  );
  const english = getLyrics('1').lines[1],
    batches: string[][] = [];
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        batches.push(texts);
        return fake.translate(texts);
      },
    },
    async () => {},
  );
  await setTranslationForeground(true);
  assert.deepEqual(batches, [['日']]);
  assert.equal(hasTranslations('1'), true);
  assert.equal(getLyrics('1').lines[1], english);
  const translated = getLyrics('1');
  libraryStore.getState().applyTranslationsToSong('1');
  assert.equal(getLyrics('1'), translated);
  assert.equal(getLyrics('1').lines[0], translated.lines[0]);
});

test('1k songs with 40 lines translate in under two seconds', async (t) => {
  libraryStore.getState().setLibrary(
    makeLibrary(
      Array.from({ length: 1000 }, (_, song) => Array.from({ length: 40 }, (_, index) => `日${song}:${index}`)),
      'song:',
    ),
  );
  let calls = 0,
    saves = 0;
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        calls++;
        return fake.translate(texts);
      },
    },
    async () => {
      saves++;
    },
  );
  const start = performance.now();
  await setTranslationForeground(true);
  const elapsed = performance.now() - start;
  assert.equal(calls, 1000);
  assert.equal(saves, 1000);
  assert.equal(Object.keys(libraryStore.getState().translations).length, 40000);
  assert.ok(libraryStore.getState().songs.every((song) => hasTranslations(song.id)));
  assert.ok(elapsed < 2000, `Translation took ${elapsed.toFixed(1)} ms`);
  t.diagnostic(`1000 songs / 40000 lines: ${elapsed.toFixed(1)} ms`);
});

test('reset during a blocked batch cannot clobber the resumed session', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  let calls = 0,
    saves = 0;
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        if (++calls === 1) {
          entered();
          await gate;
        }
        return fake.translate(texts);
      },
    },
    async () => {
      saves++;
    },
  );
  const old = setTranslationForeground(true);
  await started;
  const stop = pauseTranslations(true),
    restart = resumeTranslations();
  release();
  await Promise.all([old, stop, restart]);
  assert.equal(calls, 2);
  assert.equal(saves, 1);
  assert.equal(hasTranslations('0'), true);
  assert.equal(libraryStore.getState().translationStatus, 'installed');
  assert.equal(libraryStore.getState().translationProgress, null);
});

test('logout pause resolves while native translation is blocked and the stale batch writes nothing', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  let saves = 0;
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        entered();
        await gate;
        return fake.translate(texts);
      },
    },
    async () => {
      saves++;
    },
  );
  const old = setTranslationForeground(true);
  await started;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pauseTranslations(true),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Pause waited for native translation')), 250);
      }),
    ]);
    libraryStore.getState().setLibrary(makeLibrary([['月']]));
    libraryStore.setState({ translationStatus: 'supported', translationError: 'new session' });
  } finally {
    clearTimeout(timer);
    release();
    await old;
  }
  assert.equal(saves, 0);
  assert.deepEqual(libraryStore.getState().translations, {});
  assert.equal(hasTranslations('0'), false);
  assert.equal(libraryStore.getState().translationStatus, 'supported');
  assert.equal(libraryStore.getState().translationError, 'new session');
});

test('pause waits for an in-flight SQLite save without publishing its invalidated batch', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  setTranslator(fake, async () => {
    entered();
    await gate;
  });
  const old = setTranslationForeground(true);
  await started;
  let paused = false;
  const stop = pauseTranslations(true).then(() => {
    paused = true;
  });
  await Promise.resolve();
  assert.equal(paused, false);
  release();
  await Promise.all([old, stop]);
  assert.equal(paused, true);
  assert.deepEqual(libraryStore.getState().translations, {});
  assert.equal(hasTranslations('0'), false);
});

test('new lyrics re-enqueue translation while the foreground worker is idle', { timeout: 1000 }, async () => {
  await setTranslationForeground(true);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    batches: string[][] = [];
  setTranslator(
    {
      ...fake,
      translate: async (texts) => {
        batches.push(texts);
        entered();
        return fake.translate(texts);
      },
    },
    async () => {},
  );
  libraryStore.getState().setLyricsResult('0', 'synced', makeLibrary([['月']]).lyrics['0']);
  await started;
  await resumeTranslations();
  assert.deepEqual(batches, [['月']]);
  assert.equal(hasTranslations('0'), true);
});

test('unsupported translation still tokenizes, persists readings, and later translates cached text', async () => {
  libraryStore.getState().setLibrary(makeLibrary([['紙の舟']]));
  let installed = false;
  const batches: string[][] = [],
    saved: Translations[] = [];
  setTranslator(
    {
      ...fake,
      translationStatus: async () => (installed ? 'installed' : 'unsupported'),
      tokenize: async (texts) => {
        batches.push(texts);
        return [
          [
            { surface: '紙', reading: 'かみ' },
            { surface: 'の舟', reading: 'のふね' },
          ],
        ];
      },
      translate: async (texts) => {
        assert.equal(installed, true);
        return fake.translate(texts);
      },
    },
    async (result) => {
      saved.push(result);
    },
  );
  await setTranslationForeground(true);
  assert.deepEqual(batches, [['紙の舟']]);
  assert.ok(getLyrics('0').lines[0]!.segments.some((segment) => segment.reading));
  assert.equal(saved.length, 1);
  assert.equal(hasTranslations('0'), false);
  let songProgress = 0;
  const unsubscribe = libraryStore.subscribe((state) => {
    if (state.translationProgress) songProgress++;
    assert.equal(state.translationSongIds.size, 0);
  });
  try {
    prioritizeTranslations(['0']);
    await resumeTranslations();
    assert.equal(songProgress, 0);
  } finally {
    unsubscribe();
  }
  assert.equal(batches.length, 1);
  installed = true;
  await resumeTranslations();
  assert.equal(hasTranslations('0'), true);
});
