import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { alignReading } from '@kashi-koi/core/japanese/text';
import { TokenizerBuilder } from '@patdx/kuromoji';
import NodeDictionaryLoader from '@patdx/kuromoji/node';
import { gzipDictionaryLoader } from '../src/platform/dictionaryLoader';
import { toTokens } from '../src/platform/tokens';

const dictionary = new URL('../../../node_modules/@patdx/kuromoji/dict/', import.meta.url);
let tokenizer: Awaited<ReturnType<TokenizerBuilder['build']>>;
before(async () => {
  tokenizer = await new TokenizerBuilder({
    loader: new NodeDictionaryLoader({ dic_path: fileURLToPath(dictionary) }),
  }).build();
});

const tokenize = (text: string) => toTokens(text, tokenizer.tokenize(text));
const gunzip = async (bytes: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),
  );
/** The ruby view of a line: readings in brackets after the kanji they sit over. */
const ruby = (text: string) =>
  tokenize(text)
    .flatMap((token) => alignReading(token.surface, token.reading))
    .map((segment) => (segment.reading ? `${segment.text}[${segment.reading}]` : segment.text))
    .join('');

test('lyric lines get furigana over kanji only, and the surfaces rebuild the line', () => {
  for (const [line, expected] of [
    ['次の駅で降りるはずだったのに', '次[つぎ]の駅[えき]で降[お]りるはずだったのに'],
    ['気づけば終点まで来ていた', '気[き]づけば終点[しゅうてん]まで来[き]ていた'],
    ['色を飲む街の灯りを', '色[いろ]を飲[の]む街[まち]の灯[あか]りを'],
  ] as const) {
    assert.equal(
      tokenize(line)
        .map((token) => token.surface)
        .join(''),
      line,
    );
    assert.equal(ruby(line), expected);
  }
});

test('tokens without kanji get no reading, katakana words included', () => {
  const tokens = tokenize('コーヒーを飲む');
  assert.deepEqual(tokens[0], { surface: 'コーヒー' });
  assert.equal(tokens.find((token) => token.surface === 'を')?.reading, undefined);
  assert.equal(tokens.find((token) => token.surface === '飲む')?.reading, 'のむ');
});

test('unknown words, punctuation, spaces and emoji are kept so the surfaces rebuild the text', () => {
  for (const text of ['Hello  world 〜 コーヒー！  😀山', '  ', '', 'ああ、君が好きだ。']) {
    const tokens = tokenize(text);
    assert.equal(tokens.map((token) => token.surface).join(''), text);
    assert.ok(tokens.every((token) => token.reading === undefined || /^[ぁ-ゖー]+$/.test(token.reading)));
  }
  assert.equal(tokenize('Hello')[0]?.reading, undefined);
});

test('a gap in kuromoji output falls back to one reading-less token', () => {
  const tokens = toTokens('次の駅', [{ surface_form: '次', reading: 'ツギ', word_type: 'KNOWN' }]);
  assert.deepEqual(tokens, [{ surface: '次', reading: 'つぎ' }, { surface: 'の駅' }]);
  assert.deepEqual(toTokens('次の駅', [{ surface_form: 'x', reading: 'エックス', word_type: 'KNOWN' }]), [
    { surface: '次の駅' },
  ]);
});

test('the browser loader decompresses .dat.gz files, and accepts bytes the server already decoded', async () => {
  const serve =
    (decoded: boolean): typeof fetch =>
    async (input) => {
      const url = String(input);
      const name = url.split('/').pop()!;
      if (!url.startsWith('/dict/') || name === 'missing.dat.gz') return new Response('no', { status: 404 });
      const gz = new Uint8Array(await readFile(new URL(name, dictionary)));
      return new Response(decoded ? await gunzip(gz) : gz);
    };
  const expected = await gunzip(new Uint8Array(await readFile(new URL('unk_char.dat.gz', dictionary))));
  for (const decoded of [false, true]) {
    const buffer = await gzipDictionaryLoader('/dict/', serve(decoded)).loadArrayBuffer('unk_char.dat.gz');
    assert.deepEqual(new Uint8Array(buffer), expected);
  }
  await assert.rejects(
    gzipDictionaryLoader('/dict/', serve(false)).loadArrayBuffer('missing.dat.gz'),
    /missing.dat.gz/,
  );

  // The whole dictionary builds through the browser loader and tokenizes like the Node one.
  const built = await new TokenizerBuilder({ loader: gzipDictionaryLoader('/dict/', serve(false)) }).build();
  assert.deepEqual(toTokens('色を飲む街', built.tokenize('色を飲む街')), tokenize('色を飲む街'));
});
