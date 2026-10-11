import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioFormat } from '../src/downloads/validation';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

test('downloaded audio is named by its container, not the song suffix', () => {
  assert.equal(audioFormat(bytes('ID3', [4, 0])), 'mp3');
  assert.equal(audioFormat(bytes([0xff, 0xfb, 0x90])), 'mp3');
  assert.equal(audioFormat(bytes('fLaC')), 'flac');
  assert.equal(audioFormat(bytes([0, 0, 0, 0x20], 'ftypM4A ')), 'm4a');
  assert.equal(audioFormat(bytes('OggS')), 'ogg');
  assert.equal(audioFormat(bytes('RIFF', [0, 0, 0, 0], 'WAVE')), 'wav');
  assert.equal(audioFormat(bytes([0xff, 0xf1, 0x50])), 'aac');
  assert.equal(audioFormat(bytes('????')), undefined);
});
