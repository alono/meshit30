// Shared filesystem contract for subject content.
// Every script goes through here so the layout is defined in exactly one place.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SUBJECTS_DIR = join(ROOT, 'subjects');
export const MANIFEST = join(SUBJECTS_DIR, 'manifest.json');

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function readManifest() {
  return readJson(MANIFEST);
}

export function listSubjects({ activeOnly = false } = {}) {
  return readManifest()
    .subjects.filter((s) => !activeOnly || s.status === 'active')
    .map((s) => s.slug);
}

export function subjectPath(slug, file) {
  return join(SUBJECTS_DIR, slug, file);
}
