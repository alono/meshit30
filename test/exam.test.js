import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildAttempt, replayAttempt, scoreAttempt } from '../src/lib/exam.js';
import { deriveSeed, rng, shuffle } from '../src/lib/rng.js';

const KEYS = ['א', 'ב', 'ג', 'ד'];
const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

function subject(topicSizes, exam = {}) {
  let id = 0;
  const questions = Object.entries(topicSizes).flatMap(([topic, size]) =>
    Array.from({ length: size }, () => ({ id: ++id, topic, correct: 'א' })),
  );
  return {
    questions,
    byId: new Map(questions.map((q) => [q.id, q])),
    exam: { questions: 5, points_per_question: 20, pass: 80, ...exam },
  };
}

test('the same seed always produces the same random stream', () => {
  const a = rng(42);
  const b = rng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(rng(42)(), rng(43)());
});

test('shuffle returns a permutation and leaves its input alone', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const output = shuffle(input, rng(7));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...output].sort(), input);
});

test('derived seeds differ per question', () => {
  assert.notEqual(deriveSeed(1, 1), deriveSeed(1, 2));
});

test('a paper mirrors the topic mix using largest remainders', () => {
  const s = subject({ a: 6, b: 3, c: 1 });
  const { questionIds } = buildAttempt(s, 1);
  const count = (topic) => questionIds.filter((id) => s.byId.get(id).topic === topic).length;
  // Exact shares are 3, 1.5 and 0.5; the spare seat goes to the first largest remainder.
  assert.deepEqual([count('a'), count('b'), count('c')], [3, 2, 0]);
});

test('a question the source damaged never reaches a paper', () => {
  const s = subject({ a: 6 });
  s.questions[0].issue = 'unreadable in the source PDF';
  const { questionIds } = buildAttempt(s, 1);
  assert.equal(questionIds.length, 5);
  assert.ok(!questionIds.includes(s.questions[0].id));
});

test('a stored seed rebuilds the identical paper', () => {
  const s = subject({ a: 20, b: 20 });
  const first = buildAttempt(s, 99);
  const again = replayAttempt(s, first);
  assert.deepEqual(again.questionIds, first.questionIds);
  assert.deepEqual(again.optionOrder, first.optionOrder);
});

test('every question gets all four options in some order', () => {
  const s = subject({ a: 10 });
  const { optionOrder } = buildAttempt(s, 3);
  for (const order of Object.values(optionOrder)) assert.deepEqual([...order].sort(), [...KEYS].sort());
});

test('the score decides the pass, and an unanswered question is wrong', () => {
  const s = subject({ a: 10 });
  const attempt = { questionIds: [1, 2, 3, 4, 5] };
  const pass = scoreAttempt(s, attempt, { 1: 'א', 2: 'א', 3: 'א', 4: 'א', 5: 'ב' });
  assert.deepEqual([pass.score, pass.passed, pass.mistakes.length], [80, true, 1]);

  const fail = scoreAttempt(s, attempt, { 1: 'א', 2: 'א', 3: 'א' });
  assert.deepEqual([fail.score, fail.passed, fail.mistakes.length], [60, false, 2]);
});

test('one wrong critical question fails a paper whose score passes', () => {
  const s = subject({ rules: 1, other: 9 }, { critical: { topics: ['rules'] } });
  const attempt = { questionIds: [1, 2, 3, 4, 5] };
  const result = scoreAttempt(s, attempt, { 1: 'ב', 2: 'א', 3: 'א', 4: 'א', 5: 'א' });
  assert.equal(result.score, 80);
  assert.equal(result.passed, false);
  assert.deepEqual(result.criticalMisses.map((r) => r.id), [1]);
});

test('every real multiple-choice pool can build a full, proportional paper', () => {
  for (const { slug, lang } of readJson('subjects/manifest.json').subjects) {
    const pool = readJson(`subjects/${slug}/questions.json`);
    if (pool.kind === 'open') continue;

    const answerable = pool.questions.filter((q) => !q.issue);
    const { questionIds } = buildAttempt({ ...pool, lang }, 2026);
    assert.equal(questionIds.length, Math.min(pool.exam.questions, answerable.length), slug);
    assert.equal(new Set(questionIds).size, questionIds.length, `${slug}: repeated question`);

    const byId = new Map(pool.questions.map((q) => [q.id, q]));
    for (const topic of new Set(answerable.map((q) => q.topic))) {
      const size = answerable.filter((q) => q.topic === topic).length;
      const share = (size / answerable.length) * questionIds.length;
      const picked = questionIds.filter((id) => byId.get(id).topic === topic).length;
      assert.ok(Math.abs(picked - share) < 1, `${slug}/${topic}: ${picked} vs share ${share}`);
    }
  }
});
