// The only module that knows how subject content is laid out on disk.
//
// Adding a subject is a content drop: create subjects/<slug>/ with its four
// files, flip the manifest entry to "active", rebuild. Nothing here changes.

import manifest from '../../subjects/manifest.json';

const questionFiles = import.meta.glob('../../subjects/*/questions.json');
const displayFiles = import.meta.glob('../../subjects/*/display.json');
const termFiles = import.meta.glob('../../subjects/*/terms.json');
const cheatsheetFiles = import.meta.glob('../../subjects/*/cheatsheet.md', {
  query: '?raw',
  import: 'default',
});

export const subjects = manifest.subjects;
export const activeSubjects = subjects.filter((s) => s.status === 'active');
export const getSubjectMeta = (slug) => subjects.find((s) => s.slug === slug);

const cache = new Map();

const pick = (files, slug) => {
  const key = Object.keys(files).find((k) => k.includes(`/subjects/${slug}/`));
  return key ? files[key]() : null;
};

/**
 * Load one subject and fold its four files into the single shape the UI uses:
 * the answer key and topics come from questions.json, every piece of text the
 * learner reads comes from display.json.
 */
export async function loadSubject(slug) {
  if (cache.has(slug)) return cache.get(slug);

  const promise = (async () => {
    const meta = getSubjectMeta(slug);
    if (!meta) throw new Error(`אין נושא בשם "${slug}" ברשימת הנושאים`);

    const [pool, display, termData, cheatsheet] = await Promise.all([
      pick(questionFiles, slug),
      pick(displayFiles, slug),
      pick(termFiles, slug),
      pick(cheatsheetFiles, slug),
    ]);
    if (!pool || !display || !termData) throw new Error(`חסרים קבצי תוכן לנושא "${slug}"`);

    const text = new Map(display.default.questions.map((q) => [q.id, q]));
    const questions = pool.default.questions.map((q) => {
      const t = text.get(q.id) ?? {};
      return {
        id: q.id,
        topic: q.topic,
        correct: q.correct,
        image: q.image,
        figures: q.figures,
        question: t.question ?? q.question,
        options: t.options ?? q.options,
        terms: t.terms ?? [],
        questionTerms: t.questionTerms ?? [],
        reconstructed: t.reconstructed ?? [],
        note: t.note,
        issue: t.issue,
      };
    });

    const terms = termData.default.terms;
    return {
      ...meta,
      exam: pool.default.exam,
      source: pool.default.source,
      questions,
      byId: new Map(questions.map((q) => [q.id, q])),
      // Topic list and per-topic counts are derived, never hardcoded: each
      // subject brings its own topics and the exam mirrors their distribution.
      topics: buildTopics(questions),
      terms,
      termsById: new Map(terms.map((t) => [t.id, t])),
      termTopics: termData.default.topics ?? [],
      cheatsheet: cheatsheet ?? '',
    };
  })();

  cache.set(slug, promise);
  return promise;
}

function buildTopics(questions) {
  const counts = new Map();
  for (const q of questions) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
