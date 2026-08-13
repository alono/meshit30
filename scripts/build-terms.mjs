#!/usr/bin/env node
// Build subjects/<slug>/terms.json from that subject's cheatsheet.md.
//
//   node scripts/build-terms.mjs mechonaut
//   node scripts/build-terms.mjs --all
//
// The dictionary drives Learn-mode flashcards and the underlined-term hints in
// Practice, so it is regenerated from the cheatsheet rather than hand-kept.
// Optional subjects/<slug>/term-overrides.json can add, patch or drop entries:
//   { "add": [{ id, he, en, gloss?, topic? }], "patch": { id: {...} }, "drop": ["id"] }

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hebrewOnly, parseCheatsheet, parseSections } from './lib/cheatsheet.mjs';
import { matchVariants } from './lib/hebrew.mjs';
import { SUBJECTS_DIR, listSubjects, readJson, writeJson } from './lib/subjects.mjs';

const args = process.argv.slice(2);
const slugs = args.includes('--all') ? listSubjects({ activeOnly: true }) : args.filter((a) => !a.startsWith('-'));

if (slugs.length === 0) {
  console.error('usage: node scripts/build-terms.mjs <slug> [...] | --all');
  process.exit(1);
}

for (const slug of slugs) build(slug);

function build(slug) {
  const dir = join(SUBJECTS_DIR, slug);
  const cheatsheetPath = join(dir, 'cheatsheet.md');
  if (!existsSync(cheatsheetPath)) {
    console.error(`✗ ${slug}: no cheatsheet.md`);
    process.exitCode = 1;
    return;
  }

  const markdown = readFileSync(cheatsheetPath, 'utf8');
  let entries = parseCheatsheet(markdown);
  entries = applyOverrides(entries, join(dir, 'term-overrides.json'), parseSections(markdown));

  const byKind = entries.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  const topics = [...new Map(entries.map((e) => [e.topic.index, e.topic])).values()].sort(
    (a, b) => a.index - b.index,
  );

  writeJson(join(dir, 'terms.json'), {
    schema: 1,
    subject: slug,
    generatedFrom: 'cheatsheet.md',
    count: entries.length,
    topics,
    terms: entries,
  });

  const kinds = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ');
  console.log(`✓ ${slug}: ${entries.length} terms (${kinds}) across ${topics.length} sections`);
}

function applyOverrides(entries, path, sectionNames = []) {
  if (!existsSync(path)) return entries;
  const ov = readJson(path);
  let out = entries;

  // A patch/drop key that matches no parsed term is almost always a typo or a
  // slug that shifted when the cheatsheet was edited — fail loudly, because the
  // override would otherwise be silently ignored.
  const known = new Set(entries.map((e) => e.id));
  const unknown = [...(ov.drop ?? []), ...Object.keys(ov.patch ?? {})].filter((id) => !known.has(id));
  if (unknown.length) {
    throw new Error(
      `term-overrides.json references unknown term id(s): ${unknown.join(', ')}\n` +
        `  known ids: ${[...known].join(', ')}`,
    );
  }

  if (ov.drop?.length) {
    const drop = new Set(ov.drop);
    out = out.filter((e) => !drop.has(e.id));
  }
  if (ov.patch) {
    out = out.map((e) => {
      const p = ov.patch[e.id];
      if (!p) return e;
      const merged = { ...e, ...p };
      if (p.he || p.aliases) merged.match = expandMatch(p.he ?? e.he, p.aliases);
      if (p.gloss && !p.definition) merged.definition = hebrewOnly(p.gloss);
      return merged;
    });
  }
  // An added term that invents a topic name silently produces a second, nearly
  // identical filter chip next to the real section ("מערכת הסיכה" beside
  // "מערכת הסיכה (שמן)"), so require added topics to match a parsed section.
  const sections = new Set([...sectionNames, ...entries.map((e) => e.topic.he)]);
  for (const add of ov.add ?? []) {
    const topic = add.topic?.he;
    if (topic && !sections.has(topic)) {
      throw new Error(
        `term-overrides.json: added term "${add.id}" uses topic "${topic}", ` +
          `which is not a cheatsheet section.\n  sections: ${[...sections].join(' · ')}`,
      );
    }
  }

  for (const add of ov.add ?? []) {
    const entry = {
      kind: 'term',
      gloss: '',
      topic: { index: 99, he: 'נוסף', en: 'Added' },
      ...add,
      match: expandMatch(add.he, add.aliases),
    };
    // Added terms get the same Hebrew-only treatment the parsed ones get.
    entry.definition = add.definition ?? hebrewOnly(entry.gloss);
    out.push(entry);
  }
  return out;
}

/** Match variants for the headword plus any hand-supplied surface forms. */
function expandMatch(he, aliases = []) {
  return [...new Set([he, ...aliases].flatMap((form) => matchVariants(form)))];
}
