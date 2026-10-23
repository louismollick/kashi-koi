import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { tokensCss } from '@kashi-koi/design/tokens-css';

test('src/styles/tokens.css is up to date with the design tokens', () => {
  const committed = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  assert.equal(committed, tokensCss(), 'Run `npm run tokens-css -w @kashi-koi/web` and commit the result');
});
