// Hebrew text helpers shared by the content scripts.
// Kept dependency-free so `node scripts/*.mjs` runs with no install step.

const NIQQUD = /[֑-ׇ]/g;
// Gershayim/geresh come in typographic and ASCII flavours in the source PDFs.
const QUOTES = /[׳״‘’“”'"]/g;

/** Canonical form used for all term matching: no niqqud, no quote marks, single spaces. */
export function normalize(text) {
  return text
    .replace(NIQQUD, '')
    // Gershayim become spaces, not nothing: the source glues words to quoted
    // terms (של"השגם"), and acronyms (סל"ד) survive because matching squeezes
    // spaces out again anyway.
    .replace(QUOTES, ' ')
    .replace(/[‎‏‪-‮]/g, '') // bidi control chars
    .replace(/[.,;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip markdown emphasis and table padding from a cell. */
export function cleanCell(cell) {
  return cell
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

// Inseparable one-letter particles that attach to the front of a Hebrew word:
// ה the · ו and · ב in · ל to · מ from · ש that · כ as. They stack (כשמרווח,
// ובמנוע), so the matcher tolerates up to two of them before a term instead of
// enumerating every prefixed spelling as a variant.
const PREFIX_LETTERS = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']);
const MAX_PREFIX = 2;

/**
 * Hebrew match variants for a dictionary term.
 *
 * Three things the exam pool does constantly:
 *   1. drops or adds the definite article inside a construct — משאבת הזנה / משאבת ההזנה
 *   2. glues a one-letter preposition onto the head word — במשאבת ההזנה
 *   3. uses the short synonym the cheatsheet parenthesises — תיבת התשלובת (גיר)
 * Both article forms are emitted rather than guessed at: a word may legitimately
 * begin with ה (הזנה), and a variant that matches nothing is harmless.
 * Slash alternations (שסתום יניקה / פליטה) expand into one variant per branch.
 */
export function matchVariants(term) {
  const { head, parentheticals } = splitParentheticals(term);
  const base = normalize(head);
  if (!base) return [];
  const out = new Set();

  // Prepends unconditionally: הזנה is a noun that already starts with ה, and the
  // articled form the pool actually uses is the doubled משאבת ההזנה.
  const withArticles = (words) => words.map((w, i) => (i === 0 ? w : 'ה' + w));
  const bareArticles = (words) =>
    words.map((w, i) => (i > 0 && w.startsWith('ה') && w.length > 2 ? w.slice(1) : w));

  for (const branch of expandSlashes(base)) {
    const words = branch.split(' ');
    // The pool marks the definite article inconsistently across a construct
    // chain (משאבת הטבילה הניידת vs משאבת טבילה ניידת), so emit both extremes.
    for (const form of [words, withArticles(words), bareArticles(words)]) {
      out.add(form.join(' '));
      out.add(pluralize(form).join(' '));
    }
  }

  // A parenthesised gloss of one or two plain words is a synonym worth matching
  // (גיר, ג'בסקו) — anything longer is a scope note (במנוע 2 פעימות), not a term.
  for (const p of parentheticals) {
    const norm = normalize(p);
    if (!norm || /\d/.test(norm) || norm.split(' ').length > 2) continue;
    out.add(norm);
    out.add(pluralize(norm.split(' ')).join(' '));
  }

  return [...out].filter(Boolean);
}

/** Regular masculine/feminine plural of the final word: נדנד -> נדנדים, בוכנה -> בוכנות. */
function pluralize(words) {
  const last = words[words.length - 1];
  if (!last || last.length < 3) return words;
  const stem = last.endsWith('ה') ? last.slice(0, -1) : last;
  const plural = last.endsWith('ה') ? stem + 'ות' : stem + 'ים';
  return [...words.slice(0, -1), plural];
}

/** "תיבת התשלובת (גיר)" -> { head: "תיבת התשלובת", parentheticals: ["גיר"] } */
function splitParentheticals(term) {
  const parentheticals = [...term.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  return { head: term.replace(/\([^)]*\)/g, ' '), parentheticals };
}

/** "שסתום יניקה / פליטה" -> ["שסתום יניקה", "שסתום פליטה"] */
function expandSlashes(text) {
  if (!text.includes('/')) return [text];
  const parts = text.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [text];
  const headWords = parts[0].split(' ');
  const out = [parts[0]];
  for (const tail of parts.slice(1)) {
    // a bare one-word branch inherits the head of the first branch
    if (!tail.includes(' ') && headWords.length > 1) {
      out.push([...headWords.slice(0, -1), tail].join(' '));
    } else {
      out.push(tail);
    }
  }
  return out;
}

const isLetter = (ch) => Boolean(ch) && /[֐-׿\w]/.test(ch);

/**
 * Word-boundary test against the original spacing: never match inside a longer
 * word, but allow the match to start after one or two attached particles so
 * כשמרווח השסתומים still finds מרווח שסתומים.
 */
function boundaryOk(haystack, start, end) {
  if (isLetter(haystack[end])) return false;
  for (let skipped = 0; skipped <= MAX_PREFIX; skipped++) {
    const before = haystack[start - skipped - 1];
    if (!isLetter(before)) return true;
    if (!PREFIX_LETTERS.has(before)) return false;
  }
  return false;
}

/**
 * Strip spaces and hyphens, keeping a map back to the original offsets.
 *
 * The official pool is PDF-extracted and litters spaces inside words
 * ("לחץ ה ש מן", "מכש ירי קשר"), so matching happens on the squeezed text.
 * Mapping back means the boundary check still runs against real spacing —
 * which is what stops "שמן" from matching inside "שמנוע".
 */
function squeeze(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' || text[i] === '-' || text[i] === '–') continue;
    out += text[i];
    map.push(i);
  }
  return { out, map };
}

/**
 * Find every dictionary term present in `text`.
 * Longest variant wins, and overlapping shorter hits are dropped, so
 * "משאבת הזרקה" never also reports the generic "משאבה".
 */
export function findTerms(text, dictionary) {
  const hay = ' ' + normalize(text) + ' ';
  const { out: squeezed, map } = squeeze(hay);
  const hits = [];

  for (const entry of dictionary) {
    let best = null;
    for (const variant of entry.match) {
      const needle = squeeze(variant).out;
      if (!needle) continue;
      let from = 0;
      let idx;
      while ((idx = squeezed.indexOf(needle, from)) !== -1) {
        from = idx + 1;
        const start = map[idx];
        const end = map[idx + needle.length - 1] + 1;
        if (!boundaryOk(hay, start, end)) continue;
        if (!best || needle.length > best.length) best = { start, end, length: needle.length };
        break;
      }
    }
    if (best) hits.push({ id: entry.id, start: best.start, end: best.end });
  }

  hits.sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept = [];
  for (const hit of hits) {
    if (kept.some((k) => hit.start < k.end && k.start < hit.end)) continue;
    kept.push(hit);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept.map((k) => k.id);
}
