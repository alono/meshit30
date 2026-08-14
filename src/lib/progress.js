// Per-subject progress: what she has seen, what she keeps getting wrong, and
// how her exam attempts are trending.

import { clearSubject, read, remove, write } from './storage.js';

const AREAS = { answers: 'answers', deck: 'deck', attempts: 'attempts', wrong: 'wrong' };

/**
 * The four independently-stored parts of progress, each resettable on its own.
 *
 * They are genuinely independent rather than views of one blob: clearing the
 * exam history leaves the per-question statistics alone, and vice versa — which
 * is why each says plainly what it holds and what resetting it costs.
 */
export const RESETTABLE = [
  {
    id: AREAS.answers,
    he: 'סטטיסטיקת שאלות',
    note: 'כיסוי המאגר והדיוק לפי נושא. אינו מוחק את היסטוריית הסימולציות.',
    count: (slug) => Object.keys(loadAnswers(slug)).length,
    unit: 'שאלות',
  },
  {
    id: AREAS.deck,
    he: 'כרטיסיות השינון',
    note: 'הקופסאות של כל הכרטיסיות חוזרות לקופסה הראשונה.',
    count: (slug) => Object.keys(loadDeck(slug)).length,
    unit: 'כרטיסיות',
  },
  {
    id: AREAS.attempts,
    he: 'היסטוריית הסימולציות',
    note: 'הציונים, הרצף והגרף. אינו מוחק את סטטיסטיקת השאלות.',
    count: (slug) => loadAttempts(slug).length,
    unit: 'ניסיונות',
  },
  {
    id: AREAS.wrong,
    he: 'תור התרגול החוזר',
    note: 'רשימת השאלות שטעית בהן, המשמשת לסינון בתרגול.',
    count: (slug) => loadWrongQueue(slug).length,
    unit: 'שאלות',
  },
];

/** Reset one area. */
export const resetArea = (slug, area) => remove(slug, area);

/** Reset everything stored for this subject, leaving other subjects untouched. */
export const resetSubject = (slug) => clearSubject(slug);

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
    // The paper itself, so a review shows exactly what was on screen even if
    // the pool changes in a future content update. Older attempts without
    // these fields are rebuilt from the seed.
    questionIds: attempt.questionIds,
    optionOrder: attempt.optionOrder,
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
