// Parses a subject cheatsheet.md into a structured term dictionary.
//
// Contract the cheatsheet must follow (mechonaut's already does):
//   * sections are `## <n>. <Hebrew> | <English>`
//   * term tables are markdown tables whose first column is Hebrew and whose
//     second column is the English equivalent; the header names the columns
//     (עברית|English, תסמין|Symptom, עובדה|Fact).
//   * a third column, if present, is the short gloss.

import { cleanCell, matchVariants, normalize } from './hebrew.mjs';

const SECTION_RE = /^##\s+(?:(\d+)\.\s*)?(.+?)\s*(?:\|\s*(.+?))?\s*$/;

// Which header shapes are term-bearing, and what kind of card they produce.
const HEADER_KINDS = {
  english: 'term',
  symptom: 'symptom',
  fact: 'fact',
};

/**
 * Every `## n. Hebrew | English` heading, including sections that carry no term
 * table (בטיחות ובקרת נזקים is all prose). Added terms may be filed under any
 * of these.
 */
export function parseSections(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('## '))
    .map((l) => l.trim().match(SECTION_RE))
    .filter(Boolean)
    .map((m) => cleanCell(m[2]));
}

export function parseCheatsheet(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  const seen = new Map();

  let section = { index: 0, he: 'כללי', en: 'General' };
  let header = null;

  for (const raw of lines) {
    const line = raw.trim();

    const heading = line.startsWith('## ') && line.match(SECTION_RE);
    if (heading) {
      section = {
        index: heading[1] ? Number(heading[1]) : section.index + 1,
        he: cleanCell(heading[2]),
        en: heading[3] ? cleanCell(heading[3]) : cleanCell(heading[2]),
      };
      header = null;
      continue;
    }

    if (!line.startsWith('|')) {
      header = null;
      continue;
    }

    const cells = splitRow(line);

    // separator row (|---|---|) — keep the header we just read
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;

    if (!header) {
      const kind = HEADER_KINDS[cells[1]?.toLowerCase()];
      header = kind ? { kind } : { kind: null };
      continue;
    }
    if (!header.kind) continue;

    // "מחליף חום (COOLER)" -> "מחליף חום", but "אימפלר גומי (ג'בסקו)" keeps its
    // Hebrew synonym: the headword is the front of a Hebrew-only flashcard.
    const he = cleanCell(cells[0] ?? '').replace(/\s*\([^)]*[a-zA-Z][^)]*\)/g, '');
    const en = cleanCell(cells[1] ?? '');
    const gloss = cleanCell(cells[2] ?? '');
    if (!he || !en || he === '—' || en === '—') continue;

    const id = slug(en, he);
    if (seen.has(id)) continue;

    const cleanGloss = gloss === '—' ? '' : gloss;
    const entry = {
      id,
      he,
      en,
      gloss: cleanGloss,
      // Hebrew-only rendering of the gloss, used as the flashcard's answer side.
      definition: hebrewOnly(cleanGloss),
      kind: header.kind,
      topic: { index: section.index, he: section.he, en: section.en },
      match: matchVariants(he),
    };
    seen.set(id, entry);
    entries.push(entry);
  }

  return entries;
}

/**
 * Strip the English out of a bilingual gloss, keeping every Hebrew clause.
 *
 * The glosses are written as "Hebrew — English", but several carry further
 * Hebrew after the English ("מרווח להתפשטות טרמית — thermal expansion gap.
 * גדול מדי → רעש…"), so cutting at the em-dash would throw away the most
 * useful half. Latin runs are removed instead and the orphaned punctuation
 * they leave behind is tidied up.
 */
export function hebrewOnly(text) {
  // Parenthesised English first, so "נמדדת באמפר-שעה (Ah)" keeps its Hebrew
  // instead of being discarded whole by the clause filter below.
  const stripped = text.replace(/\([^)]*[a-zA-Z][^)]*\)/g, ' ');

  // Then drop whole clauses that are English. Removing Latin word by word
  // instead would strand the punctuation between them — "scavenging &
  // combustion" leaves a lone "&" trailing the Hebrew.
  const clauses = stripped
    .split(/\s*—\s*|\s*·\s*|\.\s+/)
    .map((c) => c.trim())
    .filter((c) => c && !/[a-zA-Z]/.test(c));

  return clauses
    .join(' · ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[\s.,;:·—-]+/, '')
    .replace(/[\s·—,;:-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function slug(en, he) {
  const base = en
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || normalize(he).replace(/\s+/g, '-');
}
