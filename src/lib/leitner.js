// Leitner scheduling and session building for the שינון deck.
//
// Three boxes, and the box is a calendar, not just a priority: box 1 is always
// due, box 2 comes back after a day, box 3 after three days. Study happens in
// finite rounds — drawn once, walked to the end, closed with a summary — and a
// card that fails mid-round returns a few cards later in the same round, the
// way Anki's learning steps work.
//
// Every term yields two cards — מונח→הגדרה and הגדרה→מונח — and each direction
// is boxed on its own, because recognising a term is much easier than
// producing it and the two should not be promoted together.

import { newSeed, rng, shuffle } from './rng.js';

export const BOXES = 3;
export const DIRECTIONS = ['term', 'definition'];

const DAY = 24 * 60 * 60 * 1000;
// Due interval per box (index box-1). Box 1 is always due.
export const INTERVALS = [0, 1 * DAY, 3 * DAY];

// In-round relearning: a failed card is reinserted this many cards ahead…
const REQUEUE_GAP = [3, 5];
// …and at most this many times per round, so one stubborn card cannot loop.
const MAX_REQUEUES = 2;

/** Facts are a statement, not a two-way pair, so they only run one direction. */
const directionsFor = (term) => (term.kind === 'fact' ? ['term'] : DIRECTIONS);

export const cardId = (termId, direction) => `${termId}:${direction}`;

export function buildDeck(terms, { topic = null } = {}) {
  return terms
    .filter((t) => !topic || t.topic.he === topic)
    .flatMap((t) =>
      directionsFor(t).map((direction) => ({
        id: cardId(t.id, direction),
        termId: t.id,
        direction,
        kind: t.kind,
        topic: t.topic.he,
        front: direction === 'term' ? t.he : t.definition,
        back: direction === 'term' ? t.definition : t.he,
      })),
    );
}

/**
 * A stored entry with no `due` (state written before scheduling existed) is
 * simply due now — which is also the correct migration.
 */
const dueAt = (entry) => entry?.due ?? 0;
const isDue = (entry, now) => dueAt(entry) <= now;

/** "זכרתי" promotes one box; "לא זכרתי" drops straight back to box 1.
 *  Either way the card's next due date follows its new box. */
export function grade(state, cardId, known, now = Date.now()) {
  const current = state[cardId]?.box ?? 1;
  const box = known ? Math.min(current + 1, BOXES) : 1;
  return {
    ...state,
    [cardId]: {
      box,
      due: now + INTERVALS[box - 1],
      seenAt: now,
      right: (state[cardId]?.right ?? 0) + (known ? 1 : 0),
      wrong: (state[cardId]?.wrong ?? 0) + (known ? 0 : 1),
    },
  };
}

export function deckStats(deck, state) {
  const counts = [0, 0, 0];
  for (const card of deck) counts[(state[card.id]?.box ?? 1) - 1]++;
  return { counts, total: deck.length, learned: counts[BOXES - 1] };
}

/**
 * Everything the entry dashboard shows: what is waiting, what is new, when the
 * next scheduled card arrives, and per-topic due counts for the chips.
 */
export function deckOverview(deck, state, now = Date.now()) {
  let due = 0;
  let fresh = 0;
  let nextDue = null;
  const dueByTopic = new Map();

  for (const card of deck) {
    const entry = state[card.id];
    if (!entry) {
      fresh++;
      continue;
    }
    if (isDue(entry, now)) {
      due++;
      dueByTopic.set(card.topic, (dueByTopic.get(card.topic) ?? 0) + 1);
    } else if (nextDue === null || dueAt(entry) < nextDue) {
      nextDue = dueAt(entry);
    }
  }

  return { due, fresh, nextDue, dueByTopic, ...deckStats(deck, state) };
}

/**
 * Draw one round.
 *
 * Tiers, in order: overdue cards (lowest box first — the weakest material —
 * most overdue first within a box), then never-seen cards, then, only when
 * `studyAhead` is set, cards that are not yet due. Each tier is lightly
 * shuffled so consecutive rounds over the same material do not repeat an
 * identical order.
 */
export function buildSession(deck, state, { size = 15, studyAhead = false, now = Date.now() } = {}) {
  const random = rng(newSeed());
  const overdue = [];
  const fresh = [];
  const ahead = [];

  for (const card of deck) {
    const entry = state[card.id];
    if (!entry) fresh.push(card);
    else if (isDue(entry, now)) overdue.push(card);
    else ahead.push(card);
  }

  overdue.sort((a, b) => {
    const ea = state[a.id];
    const eb = state[b.id];
    if (ea.box !== eb.box) return ea.box - eb.box;
    return dueAt(ea) - dueAt(eb);
  });

  // Shuffle within equivalence groups only, so the tier ordering above holds.
  const grouped = [];
  for (let i = 0; i < overdue.length; ) {
    let j = i;
    while (j < overdue.length && state[overdue[j].id].box === state[overdue[i].id].box) j++;
    grouped.push(...shuffle(overdue.slice(i, j), random));
    i = j;
  }

  const pool = [...grouped, ...shuffle(fresh, random)];
  if (studyAhead) pool.push(...shuffle(ahead, random));

  return pool.slice(0, size);
}

/**
 * One round in progress. Pure data + pure transitions, so the screen stays a
 * thin shell and the logic is testable.
 *
 * The queue holds card ids; `cards` maps id -> card. `firstGrade` records the
 * verdict of each card's FIRST appearance — that is what moves boxes and what
 * the summary counts. A requeued appearance only steers the in-round flow:
 * getting it right twenty seconds after being shown the answer is not
 * evidence of retention.
 */
export function startRound(cards) {
  return {
    cards: new Map(cards.map((c) => [c.id, c])),
    queue: cards.map((c) => c.id),
    cursor: 0,
    requeues: {},
    firstGrade: {},
    total: cards.length,
  };
}

export const currentCard = (round) =>
  round.cursor < round.queue.length ? round.cards.get(round.queue[round.cursor]) : null;

export const roundDone = (round) => round.cursor >= round.queue.length;

/** Position for the progress bar: first-appearance cards answered so far. */
export const roundProgress = (round) => ({
  answered: Object.keys(round.firstGrade).length,
  total: round.total,
});

export function answerCard(round, known) {
  const id = round.queue[round.cursor];
  const isFirst = !(id in round.firstGrade);
  const next = {
    ...round,
    cursor: round.cursor + 1,
    firstGrade: isFirst ? { ...round.firstGrade, [id]: known } : round.firstGrade,
  };

  if (!known && (round.requeues[id] ?? 0) < MAX_REQUEUES) {
    const gap = REQUEUE_GAP[0] + Math.floor(Math.random() * (REQUEUE_GAP[1] - REQUEUE_GAP[0] + 1));
    const at = Math.min(next.cursor + gap, next.queue.length);
    next.queue = [...next.queue.slice(0, at), id, ...next.queue.slice(at)];
    next.requeues = { ...round.requeues, [id]: (round.requeues[id] ?? 0) + 1 };
  }

  return { round: next, countsForBox: isFirst };
}

/** Summary of a finished round, computed against the deck state at its start. */
export function summarizeRound(round, stateBefore) {
  const entries = Object.entries(round.firstGrade);
  const known = entries.filter(([, k]) => k);
  const missed = entries.filter(([, k]) => !k);

  const boxBefore = (id) => stateBefore[id]?.box ?? 1;
  // A known card already sitting in the top box stays there — not a promotion.
  const promoted = known.filter(([id]) => boxBefore(id) < BOXES);
  const reachedTop = known.filter(([id]) => boxBefore(id) === BOXES - 1);
  // A missed card that was already in box 1 had nowhere to fall.
  const reset = missed.filter(([id]) => boxBefore(id) > 1);

  return {
    total: entries.length,
    known: known.length,
    missed: missed.length,
    promoted: promoted.length,
    reset: reset.length,
    reachedTop: reachedTop.length,
    missedCards: missed.map(([id]) => round.cards.get(id)),
  };
}
