// Exam paper generation and scoring.
//
// Every parameter — how many questions, how long, what counts as a pass —
// comes from the subject's own `exam` block. Nothing about מכונאות's
// 50 questions / 60 minutes / pass 84 is baked in here.

import { deriveSeed, rng, shuffle } from './rng.js';

export const OPTION_KEYS = ['א', 'ב', 'ג', 'ד'];

/** Questions the PDF damaged past the point of being fairly answerable. */
export const isAnswerable = (q) => !q.issue;

/**
 * Draw a paper whose topic mix mirrors the pool's.
 *
 * Each topic gets its proportional share (largest-remainder, so the counts add
 * up exactly), then questions are picked within each topic. Without this a
 * random draw of 50 from 178 can badly over- or under-weight a topic and the
 * per-topic breakdown on the results screen stops meaning anything.
 */
export function buildAttempt(subject, seed) {
  const random = rng(seed);
  const total = Math.min(subject.exam.questions, subject.questions.filter(isAnswerable).length);

  const byTopic = new Map();
  for (const q of subject.questions) {
    if (!isAnswerable(q)) continue;
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q);
  }

  const pool = [...byTopic.values()].reduce((n, list) => n + list.length, 0);
  const quotas = [...byTopic.entries()].map(([topic, list]) => {
    const exact = (list.length / pool) * total;
    return { topic, list, take: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let left = total - quotas.reduce((n, q) => n + q.take, 0);
  for (const q of [...quotas].sort((a, b) => b.remainder - a.remainder)) {
    if (left <= 0) break;
    if (q.take < q.list.length) {
      q.take++;
      left--;
    }
  }

  const picked = quotas.flatMap(({ list, take }) => shuffle(list, random).slice(0, take));

  return {
    seed,
    startedAt: Date.now(),
    questionIds: shuffle(picked, random).map((q) => q.id),
    // Option order is drawn from a stream derived per question, so it stays
    // stable even if the question order changes.
    optionOrder: Object.fromEntries(
      picked.map((q) => [q.id, shuffle(OPTION_KEYS, rng(deriveSeed(seed, q.id)))]),
    ),
  };
}

/** Rebuild an identical paper from a stored attempt. */
export const replayAttempt = (subject, attempt) => buildAttempt(subject, attempt.seed);

/**
 * Topics whose questions disqualify the whole paper when answered wrong.
 *
 * ימאות is scored this way: a wrong answer to a rule-of-the-road question —
 * one whose consequence is a collision or an injury — fails the exam whatever
 * the score. Subjects without an `exam.critical` block are unaffected.
 */
export const criticalTopics = (subject) => new Set(subject.exam.critical?.topics ?? []);

export function scoreAttempt(subject, attempt, answers) {
  const points = subject.exam.points_per_question;
  const critical = criticalTopics(subject);
  const rows = attempt.questionIds.map((id) => {
    const q = subject.byId.get(id);
    const given = answers[id] ?? null;
    return {
      id,
      topic: q.topic,
      given,
      correct: q.correct,
      right: given === q.correct,
      critical: critical.has(q.topic),
    };
  });

  const right = rows.filter((r) => r.right).length;
  const score = right * points;
  const criticalMisses = rows.filter((r) => r.critical && !r.right);

  const byTopic = new Map();
  for (const r of rows) {
    const t = byTopic.get(r.topic) ?? { topic: r.topic, total: 0, right: 0 };
    t.total++;
    if (r.right) t.right++;
    byTopic.set(r.topic, t);
  }

  return {
    rows,
    right,
    total: rows.length,
    score,
    passed: score >= subject.exam.pass && criticalMisses.length === 0,
    pass: subject.exam.pass,
    criticalMisses,
    criticalRule: subject.exam.critical ?? null,
    byTopic: [...byTopic.values()].sort((a, b) => a.right / a.total - b.right / b.total),
    mistakes: rows.filter((r) => !r.right),
  };
}
