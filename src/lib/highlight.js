// Split Hebrew text into plain runs and term runs, so Practice can underline
// the technical vocabulary and show its Hebrew definition on tap.
//
// Matching mirrors scripts/lib/hebrew.mjs: compare on a squeezed form (letters
// and digits only) so gershayim and stray spacing cannot block a hit, but map
// the result back to the original string and check the word boundary there.

const KEEP = /[א-ת0-9a-zA-Z]/;
const PREFIX_LETTERS = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']);
const MAX_PREFIX = 2;
const isLetter = (ch) => Boolean(ch) && /[֐-׿\w]/.test(ch);

function squeeze(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    if (!KEEP.test(text[i])) continue;
    out += text[i];
    map.push(i);
  }
  return { out, map };
}

function boundaryOk(text, start, end) {
  if (isLetter(text[end])) return false;
  for (let skipped = 0; skipped <= MAX_PREFIX; skipped++) {
    const before = text[start - skipped - 1];
    if (!isLetter(before)) return true;
    if (!PREFIX_LETTERS.has(before)) return false;
  }
  return false;
}

/**
 * @param text   the Hebrew string to render
 * @param terms  the term records this question is tagged with
 * @returns array of { text, term? } segments in reading order
 */
export function highlightTerms(text, terms) {
  if (!text || !terms?.length) return [{ text }];

  const { out: hay, map } = squeeze(text);
  const hits = [];

  for (const term of terms) {
    let best = null;
    for (const variant of term.match ?? [term.he]) {
      const needle = squeeze(variant).out;
      if (!needle) continue;
      let from = 0;
      let idx;
      while ((idx = hay.indexOf(needle, from)) !== -1) {
        from = idx + 1;
        const start = map[idx];
        const end = map[idx + needle.length - 1] + 1;
        if (!boundaryOk(text, start, end)) continue;
        if (!best || needle.length > best.length) best = { start, end, length: needle.length };
        break;
      }
    }
    if (best) hits.push({ term, start: best.start, end: best.end });
  }

  // Longest wins, overlaps dropped: "משאבת ההזרקה" must not also match "משאבה".
  hits.sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept = [];
  for (const hit of hits) {
    if (kept.some((k) => hit.start < k.end && k.start < hit.end)) continue;
    kept.push(hit);
  }
  kept.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  for (const hit of kept) {
    if (hit.start > cursor) segments.push({ text: text.slice(cursor, hit.start) });
    segments.push({ text: text.slice(hit.start, hit.end), term: hit.term });
    cursor = hit.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
