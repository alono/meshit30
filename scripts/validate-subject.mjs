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

const OPTION_KEYS = ['א', 'ב', 'ג', 'ד'];
const HAS_LATIN = /[a-zA-Z]/;

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

  for (const field of ['questions', 'points_per_question', 'pass', 'minutes']) {
    if (typeof pool.exam?.[field] !== 'number') errors.push(`exam.${field} must be a number`);
  }
  if (pool.count !== questions.length) {
    errors.push(`count says ${pool.count} but the pool holds ${questions.length} questions`);
  }
  if (pool.exam?.questions > questions.length) {
    errors.push(`exam draws ${pool.exam.questions} questions from a pool of only ${questions.length}`);
  }
  if (pool.exam && pool.exam.questions * pool.exam.points_per_question !== 100) {
    warnings.push(
      `exam scores ${pool.exam.questions} × ${pool.exam.points_per_question} = ` +
        `${pool.exam.questions * pool.exam.points_per_question}, not 100 — the results screen shows /100`,
    );
  }

  const seenIds = new Set();
  for (const q of questions) {
    const at = `question ${q.id ?? '(no id)'}`;
    if (typeof q.id !== 'number') errors.push(`${at}: id must be a number`);
    if (seenIds.has(q.id)) errors.push(`${at}: duplicate id`);
    seenIds.add(q.id);
    if (!q.topic?.trim()) errors.push(`${at}: missing topic`);
    if (!q.question?.trim()) errors.push(`${at}: empty question text`);

    const keys = Object.keys(q.options ?? {});
    if (keys.length !== 4 || !OPTION_KEYS.every((k) => keys.includes(k))) {
      errors.push(`${at}: options must be exactly ${OPTION_KEYS.join('/')}, got ${keys.join('/') || '(none)'}`);
    } else if (!OPTION_KEYS.includes(q.correct)) {
      errors.push(`${at}: correct must be one of ${OPTION_KEYS.join('/')}, got "${q.correct}"`);
    } else if (!q.options[q.correct]?.trim()) {
      errors.push(`${at}: correct answer "${q.correct}" points at an empty option`);
    }

    // Optional image, resolved relative to the subject folder.
    if (q.image !== undefined) {
      if (typeof q.image !== 'string' || !q.image.trim()) {
        errors.push(`${at}: image must be a non-empty string`);
      } else {
        // absolute paths are served from public/, relative from the subject dir
        const file = q.image.startsWith('/')
          ? join(SUBJECTS_DIR, '..', 'public', q.image.slice(1))
          : path(q.image);
        if (!existsSync(file)) errors.push(`${at}: image "${q.image}" does not exist`);
      }
    }
  }

  // --- topic distribution: the exam is weighted to mirror it ---------------
  const topics = new Map();
  for (const q of questions) topics.set(q.topic, (topics.get(q.topic) ?? 0) + 1);
  if (topics.size === 0) errors.push('no topics found — the topic filters would be empty');
  for (const [topic, n] of topics) {
    if (n < 2) warnings.push(`topic "${topic}" has only ${n} question(s) — thin for a per-topic breakdown`);
  }

  // --- terms.json: the flashcard deck and the in-question hints ------------
  const terms = readJson(path('terms.json')).terms ?? [];
  if (!terms.length) errors.push('terms.json holds no terms');
  const knownTerms = new Set(terms.map((t) => t.id));

  // The Hebrew-only rule bans English translations, not the exam's own Latin
  // vocabulary (GPS, NAVTEX, SART, UTC…). A Latin token on a card face is
  // legitimate exactly when the official pool itself prints it.
  const poolLatin = new Set(
    questions
      .flatMap((q) => [q.question, ...Object.values(q.options)])
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
    const reconstructed = new Set(d.reconstructed ?? []);
    for (const key of reconstructed) {
      if (key !== 'question' && !OPTION_KEYS.includes(key)) {
        errors.push(`question ${q.id}: reconstructed lists "${key}", which is not a field`);
      }
    }

    const fields = [['question', q.question, d.question], ...OPTION_KEYS.map((k) => [k, q.options[k], d.options?.[k]])];
    for (const [key, source, rendered] of fields) {
      const at = `question ${q.id} ${key === 'question' ? 'stem' : `option ${key}`}`;
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
  if (latinQuestions.length) {
    warnings.push(`Latin characters render in: ${latinQuestions.join(', ')} — expected only where the exam itself prints them`);
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
