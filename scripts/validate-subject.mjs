#!/usr/bin/env node
// Check a subject folder against the fixed content contract.
//
//   node scripts/validate-subject.mjs mechonaut
//   node scripts/validate-subject.mjs --all
//
// Run this after dropping in a new subject. If it passes, the app can load the
// subject with no code changes; every rule here is something the UI relies on.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lettersOnly } from './lib/repair.mjs';
import { SUBJECTS_DIR, readManifest, readJson } from './lib/subjects.mjs';
import { ANSWER_TYPES, PART_KEYS, parseAnswerValue } from '../src/lib/open.js';

const OPTION_KEYS = ['א', 'ב', 'ג', 'ד'];
const HAS_LATIN = /[a-zA-Z]/;

// Chart 1000 covers the Israeli coast; a position outside this box is a typo.
const CHART_1000 = { latMin: 31 * 60, latMax: 34 * 60, lonMin: 33 * 60, lonMax: 36 * 60 };

const argv = process.argv.slice(2);
const manifest = readManifest();
const slugs = argv.includes('--all')
  ? manifest.subjects.filter((s) => s.status === 'active').map((s) => s.slug)
  : argv.filter((a) => !a.startsWith('-'));

if (slugs.length === 0) {
  console.error('usage: node scripts/validate-subject.mjs <slug> [...] | --all');
  process.exit(1);
}

let failed = false;
for (const slug of slugs) {
  const { errors, warnings } = validate(slug);
  for (const w of warnings) console.log(`  ⚠ ${slug}: ${w}`);
  for (const e of errors) console.error(`  ✗ ${slug}: ${e}`);
  if (errors.length) failed = true;
  else console.log(`✓ ${slug}: contract OK${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
}
process.exit(failed ? 1 : 0);

function validate(slug) {
  const errors = [];
  const warnings = [];
  const dir = join(SUBJECTS_DIR, slug);
  const path = (f) => join(dir, f);

  const entry = manifest.subjects.find((s) => s.slug === slug);
  if (!entry) errors.push('not listed in subjects/manifest.json');
  else {
    for (const field of ['he', 'en', 'status']) {
      if (!entry[field]) errors.push(`manifest entry is missing "${field}"`);
    }
    if (!['active', 'coming-soon'].includes(entry.status)) {
      errors.push(`manifest status must be "active" or "coming-soon", got "${entry.status}"`);
    }
  }

  if (!existsSync(dir)) {
    errors.push('subject folder does not exist');
    return { errors, warnings };
  }
  for (const file of ['questions.json', 'cheatsheet.md', 'terms.json', 'display.json']) {
    if (!existsSync(path(file))) errors.push(`missing ${file}`);
  }
  if (errors.length) return { errors, warnings };

  // --- questions.json: the source of truth ---------------------------------
  const pool = readJson(path('questions.json'));
  const questions = pool.questions ?? [];
  // "open" pools hold chart-work exercises with lettered sub-parts and model
  // answers instead of four options; absent means the ordinary MC contract.
  const kind = pool.kind ?? 'mc';
  if (pool.kind !== undefined && pool.kind !== 'open') {
    errors.push(`kind must be absent (multiple choice) or "open", got "${pool.kind}"`);
  }

  const examFields =
    kind === 'open' ? ['questions', 'pass', 'minutes'] : ['questions', 'points_per_question', 'pass', 'minutes'];
  for (const field of examFields) {
    if (typeof pool.exam?.[field] !== 'number') errors.push(`exam.${field} must be a number`);
  }
  if (pool.count !== questions.length) {
    errors.push(`count says ${pool.count} but the pool holds ${questions.length} questions`);
  }
  if (pool.exam?.questions > questions.length) {
    errors.push(`exam draws ${pool.exam.questions} questions from a pool of only ${questions.length}`);
  }
  if (kind !== 'open' && pool.exam && pool.exam.questions * pool.exam.points_per_question !== 100) {
    warnings.push(
      `exam scores ${pool.exam.questions} × ${pool.exam.points_per_question} = ` +
        `${pool.exam.questions * pool.exam.points_per_question}, not 100 — the results screen shows /100`,
    );
  }

  if (kind === 'open') validateOpenContainer(pool, errors);

  const seenIds = new Set();
  for (const q of questions) {
    const at = `question ${q.id ?? '(no id)'}`;
    if (typeof q.id !== 'number') errors.push(`${at}: id must be a number`);
    if (seenIds.has(q.id)) errors.push(`${at}: duplicate id`);
    seenIds.add(q.id);
    if (!q.topic?.trim()) errors.push(`${at}: missing topic`);

    if (kind === 'open') {
      validateOpenQuestion(q, at, errors);
    } else {
      if (!q.question?.trim()) errors.push(`${at}: empty question text`);

      const keys = Object.keys(q.options ?? {});
      if (keys.length !== 4 || !OPTION_KEYS.every((k) => keys.includes(k))) {
        errors.push(`${at}: options must be exactly ${OPTION_KEYS.join('/')}, got ${keys.join('/') || '(none)'}`);
      } else if (!OPTION_KEYS.includes(q.correct)) {
        errors.push(`${at}: correct must be one of ${OPTION_KEYS.join('/')}, got "${q.correct}"`);
      } else if (!q.options[q.correct]?.trim()) {
        errors.push(`${at}: correct answer "${q.correct}" points at an empty option`);
      }
    }

    // absolute paths are served from public/, relative from the subject dir
    const resolveAsset = (src) =>
      src.startsWith('/') ? join(SUBJECTS_DIR, '..', 'public', src.slice(1)) : path(src);

    // Optional single image, resolved relative to the subject folder.
    if (q.image !== undefined) {
      if (typeof q.image !== 'string' || !q.image.trim()) {
        errors.push(`${at}: image must be a non-empty string`);
      } else if (!existsSync(resolveAsset(q.image))) {
        errors.push(`${at}: image "${q.image}" does not exist`);
      }
    }

    // Optional figure strip: the plates a scenario question cites by number.
    if (q.figures !== undefined) {
      if (!Array.isArray(q.figures) || q.figures.length === 0) {
        errors.push(`${at}: figures must be a non-empty array`);
      } else {
        for (const fig of q.figures) {
          if (!fig?.src?.trim()) errors.push(`${at}: a figure has no src`);
          else if (!existsSync(resolveAsset(fig.src))) {
            errors.push(`${at}: figure "${fig.src}" does not exist`);
          }
          if (!fig?.caption?.trim()) errors.push(`${at}: figure "${fig?.src}" has no caption`);
        }
      }
    }
  }

  // Content updates may retire a question whose material changed; survivors are
  // never renumbered (saved progress and text-overrides key off the ids), so a
  // gap is legitimate — but worth an eye, since a fresh transcription has none.
  if (kind === 'open' && seenIds.size) {
    const missing = [];
    for (let i = 1; i <= Math.max(...seenIds); i++) if (!seenIds.has(i)) missing.push(i);
    if (missing.length) warnings.push(`ids are not contiguous — missing ${missing.join(', ')}`);
  }

  // --- topic distribution: the exam is weighted to mirror it ---------------
  const topics = new Map();
  for (const q of questions) topics.set(q.topic, (topics.get(q.topic) ?? 0) + 1);
  if (topics.size === 0) errors.push('no topics found — the topic filters would be empty');

  // Disqualifying topics are named as free text, so a typo would silently
  // switch the rule off instead of failing anything.
  const critical = pool.exam?.critical;
  if (critical !== undefined) {
    if (!Array.isArray(critical.topics) || critical.topics.length === 0) {
      errors.push('exam.critical.topics must be a non-empty array');
    } else {
      for (const t of critical.topics) {
        if (!topics.has(t)) errors.push(`exam.critical names topic "${t}", which no question uses`);
      }
    }
    if (!critical.note?.trim()) errors.push('exam.critical.note must explain the rule to the learner');
    if (!critical.label?.trim()) errors.push('exam.critical.label must name the disqualifying family');
  }
  for (const [topic, n] of topics) {
    if (n < 2) warnings.push(`topic "${topic}" has only ${n} question(s) — thin for a per-topic breakdown`);
  }

  // --- terms.json: the flashcard deck and the in-question hints ------------
  const terms = readJson(path('terms.json')).terms ?? [];
  if (!terms.length) errors.push('terms.json holds no terms');
  const knownTerms = new Set(terms.map((t) => t.id));

  // The Hebrew-only rule bans English translations, not the exam's own Latin
  // vocabulary (GPS, NAVTEX, SART, UTC…). A Latin token on a card face is
  // legitimate exactly when the official pool itself prints it — for an open
  // pool that includes the model answers, which is where COG/CTS/ETA live.
  const poolLatin = new Set(
    questions
      .flatMap((q) => textFields(kind, q).map(([, source]) => source ?? ''))
      .join(' ')
      .match(/[A-Za-z]+/g)
      ?.map((t) => t.toUpperCase()) ?? [],
  );
  const foreignLatin = (text) =>
    (text.match(/[A-Za-z]+/g) ?? [])
      .map((t) => t.toUpperCase())
      .filter((t) => !poolLatin.has(t));

  for (const t of terms) {
    const at = `term "${t.id}"`;
    if (!t.he?.trim()) errors.push(`${at}: empty Hebrew headword`);
    if (!t.definition?.trim()) {
      errors.push(`${at}: no Hebrew definition — the flashcard would have a blank side`);
      continue;
    }
    // The deck runs in both directions, so a definition that quotes its own
    // headword hands the learner the answer on the הגדרה→מונח card.
    if (t.definition.includes(t.he)) {
      errors.push(`${at}: the definition contains the term itself — the reverse card gives itself away`);
    }
    const foreign = [...foreignLatin(t.he), ...foreignLatin(t.definition)];
    if (foreign.length) {
      errors.push(
        `${at}: Latin not used by the exam itself on a flashcard face (${foreign.join(', ')}) — ` +
          `the app teaches only the exam's vocabulary`,
      );
    }
  }

  // --- display.json: the Hebrew text the app renders -----------------------
  const display = readJson(path('display.json'));
  const byId = new Map((display.questions ?? []).map((d) => [d.id, d]));
  const latinQuestions = [];

  for (const q of questions) {
    const d = byId.get(q.id);
    if (!d) {
      errors.push(`question ${q.id}: missing from display.json`);
      continue;
    }
    const fields = textFields(kind, q, d);
    const fieldKeys = new Set(fields.map(([key]) => key));
    const reconstructed = new Set(d.reconstructed ?? []);
    for (const key of reconstructed) {
      if (!fieldKeys.has(key)) {
        errors.push(`question ${q.id}: reconstructed lists "${key}", which is not a field`);
      }
    }
    if (kind === 'open' && (d.parts?.length ?? 0) !== (q.parts?.length ?? 0)) {
      errors.push(`question ${q.id}: display.json holds ${d.parts?.length ?? 0} parts, the source ${q.parts?.length ?? 0}`);
    }

    for (const [key, source, rendered] of fields) {
      const at = `question ${q.id} ${key === 'question' ? 'stem' : kind === 'open' ? `part ${key}` : `option ${key}`}`;
      if (!rendered?.trim()) {
        errors.push(`${at}: empty in display.json`);
        continue;
      }
      // THE invariant: repair may move whitespace and quotes but never a letter.
      // Only hand-authored reconstructions are exempt, and they are declared.
      // A missing source field is already reported by the option-key check, so
      // skip it here rather than crashing on it.
      if (typeof source === 'string' && !reconstructed.has(key) && lettersOnly(source) !== lettersOnly(rendered)) {
        errors.push(
          `${at}: letters differ from questions.json but it is not marked reconstructed\n` +
            `      source:   ${source}\n      rendered: ${rendered}`,
        );
      }
      if (HAS_LATIN.test(rendered)) latinQuestions.push(`${q.id}${key === 'question' ? '' : `/${key}`}`);
    }

    for (const id of d.terms ?? []) {
      if (!knownTerms.has(id)) errors.push(`question ${q.id}: term "${id}" is not in terms.json`);
    }
    for (const id of d.questionTerms ?? []) {
      if (!(d.terms ?? []).includes(id)) {
        errors.push(`question ${q.id}: questionTerms lists "${id}", which is absent from terms`);
      }
    }
  }
  for (const id of byId.keys()) {
    if (!seenIds.has(id)) errors.push(`display.json has an entry for unknown question ${id}`);
  }

  // Latin in rendered text is a warning, not an error: a few official questions
  // genuinely print an English label (COOLER, turbo charge) that the exam shows.
  // The chart-work exam prints Latin on most questions, so the list is capped.
  if (latinQuestions.length) {
    const shown = latinQuestions.slice(0, 12);
    const more = latinQuestions.length - shown.length;
    warnings.push(
      `Latin characters render in: ${shown.join(', ')}${more > 0 ? ` ועוד ${more}` : ''} — expected only where the exam itself prints them`,
    );
  }

  // --- freshness -----------------------------------------------------------
  const stale = (generated, source) => statSync(path(generated)).mtimeMs < statSync(path(source)).mtimeMs;
  if (stale('terms.json', 'cheatsheet.md')) {
    warnings.push('terms.json is older than cheatsheet.md — re-run build-terms.mjs');
  }
  if (existsSync(path('term-overrides.json')) && stale('terms.json', 'term-overrides.json')) {
    warnings.push('terms.json is older than term-overrides.json — re-run build-terms.mjs');
  }
  for (const src of ['questions.json', 'terms.json', 'text-overrides.json']) {
    if (existsSync(path(src)) && stale('display.json', src)) {
      warnings.push(`display.json is older than ${src} — re-run build-display.mjs`);
    }
  }
  if (!readFileSync(path('cheatsheet.md'), 'utf8').trim()) errors.push('cheatsheet.md is empty');

  return { errors, warnings };
}

/**
 * Every learner-facing text field of one question as [key, source, rendered],
 * where key doubles as the `reconstructed` marker name: "question" and א/ב/ג/ד
 * for multiple choice; "question" plus "<part>.question" / "<part>.solution"
 * for open exercises (an unlettered single part is addressed as "1").
 */
function textFields(kind, q, d = {}) {
  if (kind !== 'open') {
    return [['question', q.question, d.question], ...OPTION_KEYS.map((k) => [k, q.options?.[k], d.options?.[k]])];
  }
  const fields = [];
  if (q.question !== undefined) fields.push(['question', q.question, d.question]);
  (q.parts ?? []).forEach((p, i) => {
    const ref = p.key ?? String(i + 1);
    const dp = d.parts?.[i] ?? {};
    fields.push([`${ref}.question`, p.question, dp.question]);
    fields.push([`${ref}.solution`, p.solution, dp.solution]);
  });
  return fields;
}

function validateOpenContainer(pool, errors) {
  // The exam hands out a deviation table and the calculation answers depend on
  // it, so for an open pool it is content, not decoration.
  const table = pool.deviation_table;
  if (!Array.isArray(table) || table.length === 0) {
    errors.push('deviation_table must be a non-empty array for an open pool');
  } else {
    table.forEach((row, i) => {
      if (typeof row?.cc !== 'number' || row.cc !== i * 30) {
        errors.push(`deviation_table row ${i}: cc must be ${i * 30}, got ${row?.cc}`);
      }
      if (typeof row?.dev !== 'number' || Math.abs(row.dev) > 15) {
        errors.push(`deviation_table row ${i}: dev must be a number within ±15°, got ${row?.dev}`);
      }
    });
    if (table.at(-1)?.cc !== 360) {
      errors.push(`deviation_table must run 000°–360° in 30° steps, ends at ${table.at(-1)?.cc}`);
    } else if (table[0].dev !== table.at(-1).dev) {
      errors.push('deviation_table: dev(000°) must equal dev(360°) — same compass heading');
    }
  }

  if (pool.prelude !== undefined) {
    if (!Array.isArray(pool.prelude) || pool.prelude.some((line) => !line?.trim())) {
      errors.push('prelude must be an array of non-empty lines');
    }
  }
}

function validateOpenQuestion(q, at, errors) {
  // A stray options/correct pair would silently vanish in the open UI, hiding
  // a transcription mix-up, so mixing the two shapes is an error outright.
  if (q.options !== undefined || q.correct !== undefined) {
    errors.push(`${at}: an open pool must not carry options/correct`);
  }
  if (q.question !== undefined && !q.question?.trim()) {
    errors.push(`${at}: stem is present but empty — omit it instead`);
  }

  if (!Array.isArray(q.parts) || q.parts.length === 0) {
    errors.push(`${at}: parts must be a non-empty array`);
    return;
  }

  q.parts.forEach((p, i) => {
    const ref = p.key ?? String(i + 1);
    const here = `${at} part ${ref}`;
    // A lone part may keep the exam's unlettered layout; two or more must be
    // the sequential letter prefix the paper prints.
    if (q.parts.length > 1 || p.key !== undefined) {
      if (p.key !== PART_KEYS[i]) {
        errors.push(`${here}: key must be "${PART_KEYS[i]}" (position ${i + 1}), got "${p.key}"`);
      }
    }
    if (!p.question?.trim()) errors.push(`${here}: empty question text`);
    if (!p.solution?.trim()) errors.push(`${here}: empty solution — the reveal would show nothing`);

    if (p.answers === undefined) return;
    if (!Array.isArray(p.answers) || p.answers.length === 0) {
      errors.push(`${here}: answers must be a non-empty array when present`);
      return;
    }
    p.answers.forEach((a, j) => {
      const spot = `${here} answer ${j + 1}`;
      if (!(a?.type in ANSWER_TYPES)) {
        errors.push(`${spot}: type must be one of ${Object.keys(ANSWER_TYPES).join('/')}, got "${a?.type}"`);
        return;
      }
      const parsed = parseAnswerValue(a.type, a.value);
      if (parsed === null) {
        errors.push(`${spot}: value ${JSON.stringify(a.value)} does not parse as ${a.type}`);
        return;
      }
      if (a.type === 'position') {
        const { latMin, latMax, lonMin, lonMax } = CHART_1000;
        if (parsed.lat < latMin || parsed.lat > latMax || parsed.lon < lonMin || parsed.lon > lonMax) {
          errors.push(`${spot}: position ${JSON.stringify(a.value)} falls outside chart 1000`);
        }
      }
      if (a.tolerance !== undefined && (typeof a.tolerance !== 'number' || a.tolerance <= 0)) {
        errors.push(`${spot}: tolerance must be a positive number`);
      }
      if (a.label !== undefined && !a.label?.trim()) errors.push(`${spot}: label is present but empty`);
    });
  });
}
