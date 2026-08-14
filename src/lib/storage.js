// Progress storage.
//
// Every key is namespaced by subject and stamped with a schema version, so a
// new subject can never disturb an existing one and a future migration can be
// applied one area at a time.

const PREFIX = 'meshit30:v1:';
const SCHEMA = 1;

// Acceptance of the disclaimer is deliberately stored OUTSIDE the PREFIX that
// export/import walks, so restoring a backup on someone else's device cannot
// suppress the notice for them. Versioned, so materially rewording the text can
// re-prompt everyone by bumping the key.
const TERMS_KEY = 'meshit30:legal:v1';

export function hasAcceptedTerms() {
  try {
    return localStorage.getItem(TERMS_KEY) !== null;
  } catch {
    // Storage blocked (private mode, embedded webview): show the notice rather
    // than silently skipping it.
    return false;
  }
}

export function acceptTerms() {
  try {
    localStorage.setItem(TERMS_KEY, new Date().toISOString());
  } catch {
    // Nothing to do: the notice will simply appear again next time.
  }
}

const key = (slug, area) => `${PREFIX}${slug}:${area}`;

export function read(slug, area, fallback) {
  try {
    const raw = localStorage.getItem(key(slug, area));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== SCHEMA) return fallback;
    return parsed.data;
  } catch {
    return fallback;
  }
}

export function write(slug, area, data) {
  try {
    localStorage.setItem(key(slug, area), JSON.stringify({ schema: SCHEMA, data }));
  } catch {
    // A full or blocked storage must never take the app down mid-exam.
  }
}

export function clearSubject(slug) {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(`${PREFIX}${slug}:`)) localStorage.removeItem(k);
  }
}

/** Everything, across every subject, in one file. */
export function exportAll() {
  const data = {};
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
  }
  return JSON.stringify(
    { app: 'meshit30-trainer', schema: SCHEMA, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
}

export function importAll(json) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'meshit30-trainer') throw new Error('הקובץ אינו קובץ גיבוי של האפליקציה');
  const entries = Object.entries(parsed.data ?? {}).filter(([k]) => k.startsWith(PREFIX));
  if (!entries.length) throw new Error('לא נמצאו נתוני התקדמות בקובץ');
  for (const [k, v] of entries) localStorage.setItem(k, v);
  return entries.length;
}
