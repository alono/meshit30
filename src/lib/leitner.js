// Three-box Leitner scheduling for the שינון deck.
//
// Every term yields two cards — מונח→הגדרה and הגדרה→מונח — and each direction
// is boxed on its own, because recognising a term is much easier than
// producing it and the two should not be promoted together.

export const BOXES = 3;
export const DIRECTIONS = ['term', 'definition'];

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
 * Cards to study now, lowest box first so the weakest material comes round
 * most often. Box 3 is treated as learned and only reappears once the earlier
 * boxes are empty.
 */
export function dueCards(deck, state, limit = 20) {
  const box = (card) => state[card.id]?.box ?? 1;
  const ordered = [...deck].sort((a, b) => {
    if (box(a) !== box(b)) return box(a) - box(b);
    return (state[a.id]?.seenAt ?? 0) - (state[b.id]?.seenAt ?? 0);
  });
  const active = ordered.filter((c) => box(c) < BOXES);
  return (active.length ? active : ordered).slice(0, limit);
}

/** "זכרתי" promotes one box; "לא זכרתי" drops straight back to box 1. */
export function grade(state, cardId, known) {
  const current = state[cardId]?.box ?? 1;
  return {
    ...state,
    [cardId]: {
      box: known ? Math.min(current + 1, BOXES) : 1,
      seenAt: Date.now(),
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
