import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INTERVALS,
  answerCard,
  buildDeck,
  buildSession,
  grade,
  roundDone,
  startRound,
  summarizeRound,
} from '../src/lib/leitner.js';

const card = (id) => ({ id });

test('a term makes two cards and a fact makes one', () => {
  const topic = { he: 'נושא' };
  const deck = buildDeck([
    { id: 'pump', he: 'משאבה', definition: 'מזרימה נוזל', topic },
    { id: 'rule', kind: 'fact', he: 'כלל', definition: 'עובדה', topic },
  ]);
  assert.deepEqual(deck.map((c) => c.id), ['pump:term', 'pump:definition', 'rule:term']);
});

test('remembering climbs one box and stops at the top', () => {
  let state = {};
  state = grade(state, 'x', true, 0);
  assert.deepEqual([state.x.box, state.x.due], [2, INTERVALS[1]]);
  state = grade(state, 'x', true, 0);
  state = grade(state, 'x', true, 0);
  assert.deepEqual([state.x.box, state.x.due, state.x.right], [3, INTERVALS[2], 3]);
});

test('forgetting drops straight back to box 1, due at once', () => {
  const state = grade({ x: { box: 3, right: 5, wrong: 0 } }, 'x', false, 1000);
  assert.deepEqual([state.x.box, state.x.due, state.x.right, state.x.wrong], [1, 1000, 5, 1]);
});

test('a session serves overdue cards weakest first, then new ones, then nothing early', () => {
  const deck = ['strong', 'weak', 'new', 'later'].map(card);
  const state = {
    strong: { box: 2, due: 0 },
    weak: { box: 1, due: 0 },
    later: { box: 3, due: 5000 },
  };
  const ids = (options) => buildSession(deck, state, { now: 1000, ...options }).map((c) => c.id);

  assert.deepEqual(ids(), ['weak', 'strong', 'new']);
  assert.deepEqual(ids({ studyAhead: true }), ['weak', 'strong', 'new', 'later']);
  assert.deepEqual(ids({ size: 1 }), ['weak']);
});

test('a card someone keeps failing returns twice, then the round can end', () => {
  let round = startRound([card('x')]);
  const countsForBox = [];
  while (!roundDone(round)) {
    const step = answerCard(round, false);
    countsForBox.push(step.countsForBox);
    round = step.round;
  }
  assert.deepEqual(countsForBox, [true, false, false]);
});

test('only the first answer in a round counts', () => {
  let round = startRound([card('x')]);
  round = answerCard(round, false).round;
  const retry = answerCard(round, true);
  assert.equal(retry.countsForBox, false);
  assert.equal(retry.round.firstGrade.x, false);
  assert.ok(roundDone(retry.round));
});

test('the summary counts real moves between boxes', () => {
  const stateBefore = {
    climbing: { box: 2 },
    top: { box: 3 },
    falling: { box: 2 },
    bottom: { box: 1 },
  };
  let round = startRound(['climbing', 'top', 'falling', 'bottom'].map(card));
  round = { ...round, firstGrade: { climbing: true, top: true, falling: false, bottom: false } };

  const summary = summarizeRound(round, stateBefore);
  assert.deepEqual(
    [summary.total, summary.known, summary.missed, summary.promoted, summary.reachedTop, summary.reset],
    [4, 2, 2, 1, 1, 1],
  );
});
