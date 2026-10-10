import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { fingerprint, type SongAnalysis, type SongAnalysisDraft } from '@kashi-koi/shared';
import { openDatabase } from '../src/db/index.ts';

export const lines = ['朝の窓を開ける', '風に名前を呼ぶ'];
export const key = fingerprint(lines);

/** Small valid swaps for fixtures; behavior tests use explicit decoys. */
export const testDecoys = (translation: string) => [
  { from: translation.slice(0, 1), to: 'X', reason: 'Changes the sentence.' },
  { from: translation.slice(0, 1), to: 'Y', reason: 'Changes the sentence differently.' },
];
export const draft: SongAnalysisDraft = {
  title: 'Morning window',
  summary: 'The speaker greets a new day. They call to someone through the wind.',
  speaker: 'The person opening the window',
  addressee: 'unclear',
  lines: ['I open the morning window', 'I call your name into the wind'],
  sentences: [
    {
      start: 0,
      end: 1,
      translation: 'Opening the morning window, I call your name into the wind.',
      decoys: testDecoys('Opening the morning window, I call your name into the wind.'),
    },
  ],
};
export const analysis: SongAnalysis = {
  ...draft,
  schemaVersion: 2,
  fingerprint: key,
  model: 'test-model',
  createdAt: '2026-10-08T00:00:00.000Z',
};

export function testStore(t: TestContext) {
  const dataDir = mkdtempSync(join(tmpdir(), 'kashi-server-test-'));
  const store = openDatabase(dataDir);
  t.after(() => {
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir };
}
export const input = { fingerprint: key, title: '朝の窓', artist: 'Test artist', lines, priority: 1 };
