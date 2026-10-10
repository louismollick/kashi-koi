import assert from 'node:assert/strict';
import test from 'node:test';
import { gapOf, quizChoices } from '../src/lyrics/choices';
import type { Choice } from '../src/types/domain';

const quiz = {
  phrase: 'left',
  decoys: [
    { phrase: 'will leave', reason: 'The verb is past tense.' },
    { phrase: '$& had left', reason: 'The verb has no past-perfect marking.' },
  ],
};

test('gap choices replace only the first phrase and share exactly one marked part', () => {
  const choices = quizChoices('I left the letter, then left.', quiz);
  assert.deepEqual(
    choices.map((choice) => choice.text),
    ['I left the letter, then left.', 'I will leave the letter, then left.', 'I $& had left the letter, then left.'],
  );
  assert.deepEqual(
    choices.map((choice) => choice.correct),
    [true, false, false],
  );
  for (const choice of choices) {
    assert.equal(choice.parts.filter((part) => part.marked).length, 1);
    assert.equal(choice.parts.map((part) => part.text).join(''), choice.text);
  }
  assert.equal(choices[1]!.reason, quiz.decoys[0]!.reason);
  assert.equal(choices[0]!.reason, undefined);
  assert.deepEqual(gapOf(choices), { before: 'I ', after: ' the letter, then left.' });
});

test('gaps at either edge support empty surrounding text and split unmarked parts', () => {
  assert.deepEqual(gapOf(quizChoices('left again', quiz)), { before: '', after: ' again' });
  assert.deepEqual(gapOf(quizChoices('I left', quiz)), { before: 'I ', after: '' });
  assert.deepEqual(
    gapOf([
      {
        text: 'I left',
        correct: true,
        parts: [
          { text: 'I', marked: false },
          { text: ' ', marked: false },
          { text: 'left', marked: true },
        ],
      },
    ]),
    { before: 'I ', after: '' },
  );
});

test('gapOf rejects empty choices, full sentences, multiple gaps and mismatched surrounding text', () => {
  const choices = quizChoices('I left.', quiz);
  const plain: Choice = { text: 'I left.', correct: false, parts: [{ text: 'I left.', marked: false }] };
  assert.equal(gapOf([]), undefined);
  assert.equal(gapOf([plain]), undefined);
  assert.equal(gapOf([...choices, plain]), undefined);
  assert.equal(
    gapOf([
      ...choices,
      {
        ...plain,
        parts: [
          { text: 'I', marked: true },
          { text: ' left.', marked: true },
        ],
      },
    ]),
    undefined,
  );
  assert.equal(gapOf([...choices, ...quizChoices('You left.', quiz)]), undefined);
  assert.equal(gapOf([...choices, ...quizChoices('I left!', quiz)]), undefined);
});
