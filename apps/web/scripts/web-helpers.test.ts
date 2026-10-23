import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mixedContentError } from '../src/lib/serverUrl';

test('an http server is blocked on an https page, except on localhost', () => {
  assert.match(mixedContentError('http://nas.local:4533', 'https:') ?? '', /needs https/);
  assert.match(mixedContentError('http://192.168.1.5:4533/music', 'https:') ?? '', /needs https/);
  assert.equal(mixedContentError('https://music.example.com', 'https:'), undefined);
  // A bare host defaults to https.
  assert.equal(mixedContentError('music.example.com', 'https:'), undefined);
  assert.equal(mixedContentError('http://localhost:4533', 'https:'), undefined);
  assert.equal(mixedContentError('http://127.0.0.1:4533', 'https:'), undefined);
  // Plain http pages (local development) can call http servers.
  assert.equal(mixedContentError('http://nas.local:4533', 'http:'), undefined);
  // Invalid input is left for login to report.
  assert.equal(mixedContentError('', 'https:'), undefined);
});
