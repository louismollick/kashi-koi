import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { colors } from '../src/tokens';
import { tokensCss } from './tokens-css';

test('tokensCss is one @theme block with a variable per color and font role', () => {
  const css = tokensCss();
  assert.equal(css.match(/@theme \{/g)?.length, 1);
  assert.match(css, /--color-bg: #000000;/);
  assert.match(css, /--color-coral-deep: #df475a;/);
  assert.match(css, /--color-scrim: #090a1699;/);
  assert.equal(css.match(/--color-/g)?.length, Object.keys(colors).length);
  assert.match(css, /--font-body: 'M PLUS Rounded 1c', sans-serif;/);
  assert.match(css, /--font-pixel: 'Pixelify Sans', monospace;/);
});

test('the CLI writes the CSS to the given path', () => {
  const target = join(mkdtempSync(join(tmpdir(), 'kk-tokens-')), 'tokens.css');
  execFileSync('npx', ['tsx', join(import.meta.dirname, 'tokens-css.ts'), target], { stdio: 'pipe' });
  assert.equal(readFileSync(target, 'utf8'), tokensCss());
});
