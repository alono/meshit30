// The local content admin's server half: a Vite dev-server plugin that edits
// the hand-kept subject files and rebuilds the derived ones.
//
//   GET    /__admin/<slug>                 the subject's files, as on disk
//   PUT    /__admin/<slug>/question/<id>   fields -> questions.json
//   PUT    /__admin/<slug>/term/<id>       fields -> term-overrides.json
//   DELETE /__admin/<slug>/term/<id>       drop the term
//
// Never in production: `apply: 'serve'` keeps it out of `vite build`, and the
// dev server listens on the LAN for phone testing, so every request must also
// come from the loopback interface.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { ROOT, listSubjects, readJson, subjectPath } from './lib/subjects.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const QUESTION_FIELDS = ['topic', 'question', 'options', 'correct', 'parts', 'note', 'issue'];
// What a text-overrides entry may say about the same fields; an edit through
// the admin becomes the source text, so these go or they would mask it.
const OVERRIDE_TEXT = ['question', 'options', 'parts', 'note', 'issue'];

export default function admin() {
  return {
    name: 'meshit-admin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__admin', (req, res) => {
        handle(req, res).catch((e) => send(res, 500, { error: String(e.stderr || e.message || e) }));
      });
    },
  };
}

async function handle(req, res) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return send(res, 403, { error: 'localhost only' });
  const [slug, kind, id] = req.url.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  if (!listSubjects().includes(slug)) return send(res, 404, { error: `unknown subject "${slug}"` });
  const file = (f) => subjectPath(slug, f);
  const readOr = (f, fallback) => (existsSync(file(f)) ? readJson(file(f)) : fallback);

  if (req.method === 'GET') {
    return send(res, 200, {
      pool: readJson(file('questions.json')),
      display: readJson(file('display.json')),
      terms: readJson(file('terms.json')),
      cheatsheet: readFileSync(file('cheatsheet.md'), 'utf8'),
      termOverrides: readOr('term-overrides.json', {}),
    });
  }

  const body = req.method === 'PUT' ? JSON.parse(await text(req)) : {};

  if (kind === 'question' && req.method === 'PUT') {
    const pool = readJson(file('questions.json'));
    const q = pool.questions.find((x) => String(x.id) === id);
    if (!q) return send(res, 404, { error: `no question ${id}` });
    for (const k of QUESTION_FIELDS) {
      if (!(k in body)) continue;
      if (body[k] === '' || body[k] == null) delete q[k];
      else q[k] = body[k];
    }
    const ov = readOr('text-overrides.json', null);
    const entry = ov?.questions?.[id];
    if (entry) {
      for (const k of OVERRIDE_TEXT) delete entry[k];
      if (!Object.keys(entry).length) delete ov.questions[id];
    }
    return commit(res, slug, [
      [file('questions.json'), pool],
      ...(entry ? [[file('text-overrides.json'), ov]] : []),
    ], ['build-display', 'validate-subject']);
  }

  if (kind === 'term' && (req.method === 'PUT' || req.method === 'DELETE')) {
    const ov = readOr('term-overrides.json', {});
    const added = (ov.add ?? []).find((t) => t.id === id);
    const known = readJson(file('terms.json')).terms.some((t) => t.id === id) || ov.drop?.includes(id);
    if (req.method === 'DELETE') {
      if (added) ov.add = ov.add.filter((t) => t !== added);
      else if (known && !ov.drop?.includes(id)) ov.drop = [...(ov.drop ?? []), id];
      delete ov.patch?.[id];
    } else if (added) {
      Object.assign(added, body);
    } else if (known) {
      ov.drop = ov.drop?.filter((d) => d !== id);
      ov.patch = { ...ov.patch, [id]: { ...ov.patch?.[id], ...body } };
    } else {
      ov.add = [...(ov.add ?? []), { id, ...body }];
    }
    return commit(res, slug, [[file('term-overrides.json'), ov]], ['build-terms', 'build-display', 'validate-subject']);
  }

  send(res, 404, { error: `no route ${req.method} ${req.url}` });
}

// Write the source files, rebuild what derives from them, and put everything
// back the way it was if any step refuses the edit — a bad edit must not
// leave the subject half-built.
function commit(res, slug, writes, steps) {
  const before = writes.map(([path]) => [path, existsSync(path) ? readFileSync(path, 'utf8') : null]);
  const run = () => steps.map((s) => execFileSync('node', [`scripts/${s}.mjs`, slug], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })).join('');
  for (const [path, value] of writes) writeJsonKeep(path, value);
  try {
    send(res, 200, { ok: true, log: run() });
  } catch (e) {
    for (const [path, old] of before) (old === null ? unlinkSync(path) : writeFileSync(path, old));
    try { run(); } catch { /* the sources are back; the derived files follow */ }
    send(res, 422, { error: e.stderr || e.stdout || e.message });
  }
}

// Keep the file's indent (the pools are one-space, the overrides two) so a
// one-field edit is a one-line diff.
function writeJsonKeep(path, value) {
  const indent = (existsSync(path) && /^\{\n( +)/.exec(readFileSync(path, 'utf8'))?.[1].length) || 2;
  writeFileSync(path, JSON.stringify(value, null, indent) + '\n', 'utf8');
}

const text = (req) => new Promise((resolve, reject) => {
  let s = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { s += c; });
  req.on('end', () => resolve(s));
  req.on('error', reject);
});

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
