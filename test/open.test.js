import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAnswer, parseAnswerValue, scoreOpenAttempt } from '../src/lib/open.js';

test('a course is compared around the compass, not along a line', () => {
  const spec = { type: 'course', value: 359 };
  assert.equal(checkAnswer(spec, '1'), true);
  assert.equal(checkAnswer(spec, '2'), false);
  assert.equal(checkAnswer({ type: 'course', value: 0 }, '360'), true);
});

test('a clock time is compared across midnight', () => {
  const spec = { type: 'time', value: '23:58' };
  assert.equal(checkAnswer(spec, '00:02'), true);
  assert.equal(checkAnswer(spec, '0004'), false);
});

test('a position must be close on both axes', () => {
  const spec = { type: 'position', value: ["32° 24.6'N", "034° 42.5'E"] };
  assert.equal(checkAnswer(spec, ['32 24.7', '034 42.6']), true);
  assert.equal(checkAnswer(spec, ['32 24.7', '034 43.5']), false);
  assert.deepEqual(parseAnswerValue('position', ['1 0 S', '2 0 W']), { lat: -60, lon: -120 });
});

test('variation is signed, with east positive', () => {
  const spec = { type: 'variation', value: -4.5 };
  assert.equal(checkAnswer(spec, "4°20'W"), true);
  assert.equal(checkAnswer(spec, "4°20'E"), false);
});

test('a scale accepts the forms people write it in', () => {
  const spec = { type: 'scale', value: '1:30000' };
  assert.equal(checkAnswer(spec, '1/30,000'), true);
  assert.equal(checkAnswer(spec, '1:25000'), false);
});

test('an answer can set its own tolerance', () => {
  assert.equal(checkAnswer({ type: 'number', value: 5 }, '6'), false);
  assert.equal(checkAnswer({ type: 'number', value: 5, tolerance: 1 }, '6'), true);
});

test('unreadable input is left unchecked rather than marked wrong', () => {
  const spec = { type: 'speed', value: 5 };
  assert.equal(checkAnswer(spec, 'abc'), null);
  assert.equal(checkAnswer(spec, ''), null);
  assert.equal(checkAnswer({ type: 'time', value: '12:00' }, '25:00'), null);
});

test('an open paper scores by part, and a question is right only if all its parts are', () => {
  const questions = [
    { id: 1, topic: 'a', parts: [{}, {}] },
    { id: 2, topic: 'b', parts: [{}, {}] },
  ];
  const subject = { byId: new Map(questions.map((q) => [q.id, q])), exam: { pass: 70 } };
  const result = scoreOpenAttempt(subject, { questionIds: [1, 2] }, { 1: [true, false], 2: [true, true] });

  assert.deepEqual([result.right, result.total, result.score, result.passed], [3, 4, 75, true]);
  assert.deepEqual(result.mistakes.map((r) => r.id), [1]);
});
