// Repair of the PDF-extraction damage in the official question pools.
//
// The RASPAN PDFs are extracted with spaces wedged inside words — "למ ה עלול",
// "לחץ ה ש מן", "מהו תפק ידה" — which is unreadable for someone learning the
// vocabulary. This module rejoins those fragments.
//
// THE RULE THAT MAKES THIS SAFE: repair only ever adds, removes or moves
// whitespace and quote characters. It never touches a Hebrew letter, so the
// wording, forms and endings stay exactly the exam's. `assertLettersPreserved`
// enforces that mechanically and the build fails if it is ever violated.
//
// Anything the vocabulary cannot confirm is left alone and reported, rather
// than guessed at. Genuine word repairs (a truncated option) are hand-authored
// in subjects/<slug>/text-overrides.json instead.

/** Everything that is not a letter or digit, in any script. */
const NOT_ALPHANUM = /[^א-תa-zA-Z0-9]/g;

/** The comparison key behind the invariant: letters and digits only, in order. */
export function lettersOnly(text) {
  return text.replace(NOT_ALPHANUM, '');
}

export function assertLettersPreserved(before, after, where) {
  if (lettersOnly(before) !== lettersOnly(after)) {
    throw new Error(
      `repair changed letters at ${where} — this must never happen\n` +
        `  before: ${before}\n  after:  ${after}`,
    );
  }
}

// Hebrew words that really are one or two letters. Everything shorter than
// three letters that is not on this list is treated as a stray fragment.
// "מן" is deliberately here (נקישה מן המתנע) even though "ה ש מן" also needs
// it swallowed — the span search below resolves that case by vocabulary.
const SHORT_WORDS = new Set([
  // function words
  'של', 'על', 'את', 'אם', 'כי', 'לא', 'מה', 'זה', 'זו', 'הם', 'הן', 'יש', 'גם',
  'אך', 'או', 'עם', 'בו', 'בה', 'כל', 'רק', 'עד', 'אין', 'מן', 'לו', 'לה', 'כך',
  'מי', 'אל', 'כן', 'פי', 'תת', 'לפי', 'ע"י', 'בד"כ', 'טמפ',
  // content words this pool uses that are only two letters long
  'קו', 'תא', 'חד', 'דק', 'אף', 'קר', 'חם', 'גל', 'מד', 'ים', 'דו', 'רב', 'קל',
  'שם', 'יד', 'גז', 'רע', 'צר',
]);

/** A word token: Hebrew letters, with gershayim/apostrophes allowed inside. */
const WORD_RE = /[א-ת]+(?:["'][א-ת]+)*/g;

/** Hebrew word tokens of a string. */
export function words(text) {
  return text.match(WORD_RE) ?? [];
}

/**
 * Vocabulary of words we trust to be whole.
 *
 * The cheat sheet is human-typed and clean, so every word in it counts. The
 * question pool is damaged, so a token from it only counts when it is at least
 * three letters and occurs more than once — a fragment produced by a one-off
 * bad line break will not clear that bar, while the pool's very repetitive
 * phrasing ("מהו תפקידו של…") puts the real words in easily.
 */
export function buildVocabulary({ cheatsheet = '', corpus = [] } = {}) {
  const vocab = new Set(SHORT_WORDS);
  for (const w of words(cheatsheet)) if (w.length >= 2) vocab.add(w);

  const freq = new Map();
  for (const text of corpus) {
    for (const w of words(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  for (const [w, n] of freq) if (w.length >= 3 && n >= 2) vocab.add(w);

  return vocab;
}

/** Letters that only ever occur word-finally — so a lone one must join leftwards. */
const FINAL_FORMS = new Set(['ך', 'ם', 'ן', 'ף', 'ץ']);

const isKnown = (word, vocab) => vocab.has(word) || SHORT_WORDS.has(word);

/**
 * Wreckage we are confident about: a single letter, or a two-letter token that
 * is not a real word. Runs are seeded only from these.
 *
 * Longer unknown tokens are NOT treated as wreckage. They are usually a rare
 * prefixed form the vocabulary happens not to have seen ("החיוניים"), and
 * letting them seed a run lets them swallow the genuine fragment beside them
 * and block its repair.
 */
const isHardFragment = (word, vocab) => word.length <= 2 && !isKnown(word, vocab);

/**
 * Rejoin split words in one string.
 *
 * Works over spans of tokens: a run of adjacent fragments is grown outwards by
 * up to two tokens on each side, and the smallest span whose concatenation is a
 * known word wins. That is what tells "ה ש מן" (join all three into השמן) apart
 * from "מן המתנע" (leave alone) without special-casing either.
 *
 * Returns { text, repairs, unresolved }.
 */
export function rejoinWords(text, vocab) {
  const tokens = tokenize(text);
  const repairs = [];
  const unresolved = [];

  // Pass 1: adjacent pairs that spell a known word. This is the only thing that
  // catches a break between two long halves ("תפק ידה", "האר כובה"), which the
  // fragment-run pass below cannot see because neither half is short enough to
  // seed a run. Requiring one half to be unknown keeps real word pairs apart.
  mergeKnownPairs(tokens, vocab, repairs);

  const wordIdx = tokens.map((t, i) => (t.type === 'word' && t.value ? i : -1)).filter((i) => i >= 0);
  const merged = new Set();

  // Pass 2: runs seeded from short wreckage.
  for (let k = 0; k < wordIdx.length; k++) {
    const i = wordIdx[k];
    if (merged.has(i)) continue;
    if (!isHardFragment(tokens[i].value, vocab)) continue;
    if (isListMarker(tokens, wordIdx[k])) continue;

    // Grow the run of consecutive hard fragments starting here. Only across
    // plain whitespace — "א' ו-ג'" is an enumeration, not a broken word.
    let end = k;
    while (
      end + 1 < wordIdx.length &&
      isHardFragment(tokens[wordIdx[end + 1]].value, vocab) &&
      onlySpaceBetween(tokens, wordIdx[end], wordIdx[end + 1])
    ) {
      end++;
    }

    const span =
      findSpan(wordIdx, tokens, k, end, vocab) ?? guessSpan(wordIdx, tokens, k, end);
    if (!span) {
      // A lone particle deliberately left standing before punctuation or a
      // number is not damage, so it is not worth reporting.
      const isolatedParticle =
        k === end &&
        tokens[wordIdx[k]].value.length === 1 &&
        !adjacentWord(tokens, wordIdx, k);
      if (!isolatedParticle) {
        unresolved.push(wordIdx.slice(k, end + 1).map((j) => tokens[j].value).join(' '));
      }
      k = end;
      continue;
    }

    const from = wordIdx.slice(span.start, span.end + 1).map((i) => tokens[i].value).join(' ');
    const to = span.joined;
    if (from !== to) repairs.push({ from, to, confident: Boolean(span.confident) });

    // Collapse the span into its first token and blank the rest, keeping any
    // punctuation that sat between them out of the way.
    tokens[wordIdx[span.start]].value = to;
    for (let s = span.start + 1; s <= span.end; s++) {
      merged.add(wordIdx[s]);
      tokens[wordIdx[s]].value = '';
      for (let t = wordIdx[s - 1] + 1; t < wordIdx[s]; t++) {
        if (tokens[t].type === 'space') tokens[t].value = '';
      }
    }
    k = span.end;
  }

  return { text: tokens.map((t) => t.value).join(''), repairs, unresolved };
}

/**
 * Repeatedly join neighbouring words whose concatenation is a known word, as
 * long as at least one of the two is not a word in its own right. Repeats until
 * nothing changes, so a three-way break resolves in successive rounds.
 */
function mergeKnownPairs(tokens, vocab, repairs) {
  for (let changed = true; changed; ) {
    changed = false;
    const idx = tokens.map((t, i) => (t.type === 'word' && t.value ? i : -1)).filter((i) => i >= 0);

    for (let k = 0; k + 1 < idx.length; k++) {
      const a = tokens[idx[k]].value;
      const b = tokens[idx[k + 1]].value;
      if (isKnown(a, vocab) && isKnown(b, vocab)) continue;
      if (!vocab.has(a + b)) continue;
      if (!onlySpaceBetween(tokens, idx[k], idx[k + 1])) continue;

      repairs.push({ from: `${a} ${b}`, to: a + b, confident: true });
      tokens[idx[k]].value = a + b;
      tokens[idx[k + 1]].value = '';
      for (let t = idx[k] + 1; t < idx[k + 1]; t++) if (tokens[t].type === 'space') tokens[t].value = '';
      changed = true;
      break;
    }
  }
}

function onlySpaceBetween(tokens, from, to) {
  for (let t = from + 1; t < to; t++) if (tokens[t].type !== 'space') return false;
  return true;
}

/**
 * Smallest span covering the fragment run whose concatenation is a known word.
 * Tries the run itself first, then widens by up to two tokens each way.
 */
function findSpan(wordIdx, tokens, runStart, runEnd, vocab) {
  const joinOf = (a, b) => wordIdx.slice(a, b + 1).map((i) => tokens[i].value).join('');
  const candidates = [];

  for (let left = 0; left <= 2; left++) {
    for (let right = 0; right <= 2; right++) {
      const start = runStart - left;
      const end = runEnd + right;
      if (start < 0 || end >= wordIdx.length) continue;
      candidates.push({ start, end, width: end - start, joined: joinOf(start, end) });
    }
  }

  candidates.sort((a, b) => a.width - b.width);
  const hit = candidates.find(
    (c) => c.end > c.start && vocab.has(c.joined) && spanIsContiguous(wordIdx, tokens, c.start, c.end),
  );
  return hit ? { ...hit, confident: true } : null;
}

/**
 * A span may only be welded together across plain whitespace. Without this,
 * "תשובות א' ו-ג' נכונות" collapses into "או'" because א and ו happen to spell
 * a real word when the apostrophe between them is ignored.
 */
function spanIsContiguous(wordIdx, tokens, start, end) {
  for (let s = start; s < end; s++) {
    if (!onlySpaceBetween(tokens, wordIdx[s], wordIdx[s + 1])) return false;
  }
  return true;
}

/** `א'` / `ג'` — an enumeration marker, not a broken word. */
function isListMarker(tokens, idx) {
  const next = tokens[idx + 1];
  return tokens[idx].value.length === 1 && next && /^["']/.test(next.value);
}

/**
 * Last resort for a lone stray letter, decided by Hebrew morphology rather than
 * by the corpus:
 *
 *   ם ן ך ף ץ  occur only word-finally      -> the letter joins leftwards
 *   any other single letter is an attaching particle (ב ל מ ש ה ו כ)
 *                                            -> it joins rightwards
 *
 * Deliberately does NOT guess for two-letter fragments. "זרם חילופין חד – פאזי"
 * showed why: picking a direction by which neighbour looks unfamiliar welded
 * two perfectly good words together. Those cases are reported instead and
 * resolved by hand in text-overrides.json.
 *
 * Marked `confident: false` so the report can single them out.
 */
function guessSpan(wordIdx, tokens, runStart, runEnd) {
  const joinOf = (a, b) => wordIdx.slice(a, b + 1).map((i) => tokens[i].value).join('');
  const make = (start, end) => ({ start, end, joined: joinOf(start, end), confident: false });

  if (runStart !== runEnd) return null;
  const letter = tokens[wordIdx[runStart]].value;
  if (letter.length !== 1) return null;

  if (FINAL_FORMS.has(letter)) {
    const canJoinLeft =
      runStart > 0 && onlySpaceBetween(tokens, wordIdx[runStart - 1], wordIdx[runStart]);
    return canJoinLeft ? make(runStart - 1, runEnd) : null;
  }
  // A lone particle followed by punctuation or a number is standing on its own
  // ("שווים בקירוב ל:", "יורד מ-13.5") — leave it alone.
  return adjacentWord(tokens, wordIdx, runEnd) ? make(runStart, runEnd + 1) : null;
}

/** True when there is a next word and only whitespace separates it from this one. */
function adjacentWord(tokens, wordIdx, k) {
  if (k + 1 >= wordIdx.length) return false;
  for (let t = wordIdx[k] + 1; t < wordIdx[k + 1]; t++) {
    if (tokens[t].type !== 'space') return false;
  }
  return true;
}

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    WORD_RE.lastIndex = i;
    const m = WORD_RE.exec(text);
    if (m && m.index === i) {
      tokens.push({ type: 'word', value: m[0] });
      i += m[0].length;
      continue;
    }
    const next = m ? m.index : text.length;
    const chunk = text.slice(i, next);
    for (const piece of chunk.match(/\s+|\S/g) ?? []) {
      tokens.push({ type: /\s/.test(piece) ? 'space' : 'punct', value: piece });
    }
    i = next;
  }
  return tokens;
}

/**
 * Quote and hyphen repair. Runs BEFORE rejoining, because it is what turns
 * "אינג ' קטור" into the single token "אינג'קטור" and separates "של"השגם""
 * into words the tokenizer can see.
 */
export function pretidy(text) {
  return (
    text
      // "הספק""?" -> a single gershayim
      .replace(/"{2,}/g, '"')
      // "אינג ' קטור" / "ג ' בסקו" -> close the apostrophe up. Whitespace is
      // required on BOTH sides so that an enumeration ("תשובות א' ו-ג' נכונות")
      // keeps the space that follows its apostrophe.
      .replace(/([א-ת])\s+'\s+([א-ת])/g, "$1'$2")
      // "של"השגם"" -> let the quoted term stand as its own word
      .replace(/([א-ת]{2,})"([א-ת]{2,})"/g, '$1 "$2"')
      // "מי - שיפוליים" -> a hyphenated compound
      .replace(/([א-ת])\s+[-–]\s+([א-ת])/g, '$1-$2')
      // "מ- 13.5" / "מ -13.5" -> keep the number tight to its particle
      .replace(/([א-ת])\s*[-–]\s*(\d)/g, '$1-$2')
  );
}

/** Whitespace and terminal-punctuation tidying, applied after rejoining. */
export function posttidy(text) {
  return text
    .replace(/\s+([.,;:?!])/g, '$1')
    .replace(/([.,])\1+/g, '$1')
    .replace(/\.,|,\./g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Full repair of one string. */
export function repairText(text, vocab) {
  const rejoined = rejoinWords(pretidy(text), vocab);
  const out = posttidy(rejoined.text);
  assertLettersPreserved(text, out, 'repairText');
  return { text: out, repairs: rejoined.repairs, unresolved: rejoined.unresolved };
}
