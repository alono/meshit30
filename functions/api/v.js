// POST /api/v — one line per screen opened.
//
// A Cloudflare Pages Function, deployed automatically with the site. It exists
// for the single number Cloudflare Web Analytics cannot produce: how many
// distinct devices use the app, and how many come back. Everything else —
// traffic, country, browser, referrer — comes free from Web Analytics and is
// deliberately not duplicated here.
//
// The whole record is (date, device id, screen, subject). No IP address, no
// clock time, no answers, no scores, nothing about how anyone did.
//
// Storage is the D1 database bound as DB; see analytics/README.md for the
// dashboard setup and analytics/queries.sql for how to read it.

import manifest from '../../subjects/manifest.json';

// Mirrors SCREENS in src/lib/route.js. Kept as its own copy because Functions
// are bundled separately from the app and route.js is Vite-only.
const SCREENS = new Set([
  'home',
  'signals',
  'subject',
  'learn',
  'practice',
  'exam',
  'results',
  'study',
  'progress',
]);

const SUBJECTS = new Set(manifest.subjects.map((s) => s.slug));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Always 204, whatever happened. The caller is a beacon with nobody listening,
// and an unbound database or a bad body must never become a visible error.
const done = () => new Response(null, { status: 204 });

export async function onRequestPost({ request, env }) {
  try {
    // Browsers send Origin on every POST, so this drops casual off-site use
    // without troubling the beacon. Absent (curl, health check) is allowed.
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return done();

    const { aid, screen, subject } = await request.json();
    // Allow-listing both fields is what stops the endpoint being usable as an
    // arbitrary write sink: only known screens and known subjects get through.
    if (!UUID.test(aid) || !SCREENS.has(screen)) return done();
    const slug = SUBJECTS.has(subject) ? subject : '';

    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO hits (day, aid, screen, subject, n) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (day, aid, screen, subject) DO UPDATE SET n = n + 1`,
    )
      .bind(day, aid, screen, slug)
      .run();
  } catch {
    // Unbound DB, malformed JSON, daily write limit reached — all silent.
  }
  return done();
}
