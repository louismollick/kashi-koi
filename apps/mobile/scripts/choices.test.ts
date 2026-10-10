import assert from 'node:assert/strict';
import test from 'node:test';
import { decoyChoices } from '../src/lyrics/choices';

const translation = 'I left the letter at home, then left.';
const action = { from: 'left', to: 'found', reason: 'The verb means leaving it.' };
const place = { from: 'home', to: 'the station', reason: 'The location is home.' };

test('every choice marks every changed region, preserving spaces, punctuation and repeated text', () => {
  const choices = decoyChoices(translation, [place, action]);
  assert.deepEqual(
    choices.map((choice) => choice.parts.filter((part) => part.marked).map((part) => part.text)),
    [
      ['left', 'home'],
      ['left', 'the station'],
      ['found', 'home'],
    ],
  );
  assert.deepEqual(
    choices.map((choice) => choice.correct),
    [true, false, false],
  );
  assert.equal(choices[1]!.reason, place.reason);
  assert.equal(choices[2]!.reason, action.reason);
  assert.equal(choices[0]!.reason, undefined);
  for (const choice of choices) {
    assert.equal(choice.parts.map((part) => part.text).join(''), choice.text);
    assert.ok(choice.parts.every((part) => part.text.length > 0));
    assert.ok(choice.text.endsWith(', then left.'));
  }
});

test('decoys sharing the same first-occurrence span mark that span only once', () => {
  const choices = decoyChoices('left left', [action, { ...action, to: '$&' }]);
  assert.deepEqual(
    choices.map((choice) => choice.parts),
    [
      [
        { text: 'left', marked: true },
        { text: ' left', marked: false },
      ],
      [
        { text: 'found', marked: true },
        { text: ' left', marked: false },
      ],
      [
        { text: '$&', marked: true },
        { text: ' left', marked: false },
      ],
    ],
  );
});

test('adjacent spans stay distinct even when a replacement grows or shrinks', () => {
  const choices = decoyChoices('ab', [
    { from: 'a', to: 'alpha', reason: 'First character.' },
    { from: 'b', to: 'beta', reason: 'Second character.' },
  ]);
  assert.deepEqual(
    choices.map((choice) => choice.parts),
    [
      [
        { text: 'a', marked: true },
        { text: 'b', marked: true },
      ],
      [
        { text: 'alpha', marked: true },
        { text: 'b', marked: true },
      ],
      [
        { text: 'a', marked: true },
        { text: 'beta', marked: true },
      ],
    ],
  );
});
