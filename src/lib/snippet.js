// Pull the relevant lines out of the cheat sheet for a question she got wrong.
//
// The terms tagged on the question are the index: any cheat-sheet line that
// mentions one of them is worth showing. Preferring the terms in the stem keeps
// the snippet about what the question is actually testing.

const MAX_LINES = 3;

export function cheatsheetSnippet(subject, question) {
  const ordered = [...(question.questionTerms ?? []), ...(question.terms ?? [])];
  const seen = new Set();
  const terms = ordered
    .filter((id) => !seen.has(id) && seen.add(id))
    .map((id) => subject.termsById.get(id))
    .filter(Boolean);

  if (!terms.length) return null;

  const lines = [];
  for (const term of terms) {
    if (lines.length >= MAX_LINES) break;
    if (term.definition) lines.push(`${term.he} — ${term.definition}`);
  }
  return lines.length ? lines : null;
}
