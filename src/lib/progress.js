// Per-subject progress: what she has seen, what she keeps getting wrong, and
// how her exam attempts are trending.

import { read, write } from './storage.js';

const AREAS = { answers: 'answers', deck: 'deck', attempts: 'attempts', wrong: 'wrong' };

export const loadAnswers = (slug) => read(slug, AREAS.answers, {});
export const loadDeck = (slug) => read(slug, AREAS.deck, {});
export const loadAttempts = (slug) => read(slug, AREAS.attempts, []);
export const loadWrongQueue = (slug) => read(slug, AREAS.wrong, []);

export const saveDeck = (slug, deck) => write(slug, AREAS.deck, deck);

/** Record one practice answer and keep the review queue in step. */
export function recordAnswer(slug, questionId, right) {
  const answers = loadAnswers(slug);
  const prev = answers[questionId] ?? { seen: 0, right: 0, wrong: 0 };
  const next = {
    ...answers,
    [questionId]: {
      seen: prev.seen + 1,
      right: prev.right + (right ? 1 : 0),
      wrong: prev.wrong + (right ? 0 : 1),
      lastRight: right,
    },
  };
  write(slug, AREAS.answers, next);

  const queue = loadWrongQueue(slug);
  // A question leaves the queue only once it is answered correctly.
  const updated = right ? queue.filter((id) => id !== questionId)
    : queue.includes(questionId) ? queue : [...queue, questionId];
  write(slug, AREAS.wrong, updated);

  return next;
}

export function recordAttempt(slug, attempt, result) {
  // Exam answers count towards coverage and per-topic accuracy exactly like
  // practice answers do — otherwise a full 50-question paper leaves the
  // progress screen claiming she has barely touched the pool.
  const answers = loadAnswers(slug);
  for (const row of result.rows) {
    const prev = answers[row.id] ?? { seen: 0, right: 0, wrong: 0 };
    answers[row.id] = {
      seen: prev.seen + 1,
      right: prev.right + (row.right ? 1 : 0),
      wrong: prev.wrong + (row.right ? 0 : 1),
      lastRight: row.right,
    };
  }
  write(slug, AREAS.answers, answers);

  const attempts = loadAttempts(slug);
  const entry = {
    seed: attempt.seed,
    at: Date.now(),
    score: result.score,
    passed: result.passed,
    right: result.right,
    total: result.total,
    answers: Object.fromEntries(result.rows.map((r) => [r.id, r.given])),
  };
  const next = [...attempts, entry].slice(-50);
  write(slug, AREAS.attempts, next);

  // Exam mistakes feed the same review queue as practice mistakes.
  const queue = new Set(loadWrongQueue(slug));
  for (const row of result.rows) {
    if (row.right) queue.delete(row.id);
    else queue.add(row.id);
  }
  write(slug, AREAS.wrong, [...queue]);
  return next;
}

/** Headline numbers for the subject card and the progress screen. */
export function summarize(subject) {
  const answers = loadAnswers(subject.slug);
  const attempts = loadAttempts(subject.slug);
  const deck = loadDeck(subject.slug);

  const seenIds = Object.keys(answers);
  const totalSeen = seenIds.length;
  const totalRight = seenIds.reduce((n, id) => n + (answers[id].right ?? 0), 0);
  const totalTries = seenIds.reduce((n, id) => n + (answers[id].seen ?? 0), 0);

  const byTopic = subject.topics.map(({ name, count }) => {
    const ids = subject.questions.filter((q) => q.topic === name).map((q) => q.id);
    const stats = ids.map((id) => answers[id]).filter(Boolean);
    const right = stats.reduce((n, s) => n + s.right, 0);
    const tries = stats.reduce((n, s) => n + s.seen, 0);
    return { name, count, covered: stats.length, accuracy: tries ? right / tries : null };
  });

  // The streak the dashboard shows is consecutive passes, most recent first.
  let streak = 0;
  for (let i = attempts.length - 1; i >= 0 && attempts[i].passed; i--) streak++;

  return {
    coverage: subject.questions.length ? totalSeen / subject.questions.length : 0,
    totalSeen,
    accuracy: totalTries ? totalRight / totalTries : null,
    attempts,
    streak,
    best: attempts.reduce((m, a) => Math.max(m, a.score), 0),
    byTopic,
    learned: Object.values(deck).filter((c) => c.box >= 3).length,
    wrongCount: loadWrongQueue(subject.slug).length,
  };
}
