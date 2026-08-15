// The URL contract: which address belongs to which screen.
//
// The app is a state machine, not a router — App.jsx holds `slug` and `mode` —
// so this module is the single translation between that state and the address
// bar. Real paths exist for two reasons: the Back button then moves between
// screens instead of leaving the app, and usage analytics can tell the screens
// apart (Cloudflare Web Analytics reports by path and has no event API).
//
//   /                            home
//   /signals                     אורות וסימנים
//   /s/<slug>                    subject menu
//   /s/<slug>/<mode>             learn | practice | exam | study | progress
//   /s/<slug>/exam/results       results
//
// Hash routes are deliberately not used: the analytics beacon hooks pushState
// and popstate, and does not see hash changes.

import { activeSubjects } from '../subjects/loader.js';

const MODES = new Set(['learn', 'practice', 'exam', 'study', 'progress']);

/** Every value screenOf can return — the allow-list functions/api/v.js mirrors. */
export const SCREENS = [
  'home',
  'signals',
  'subject',
  'learn',
  'practice',
  'exam',
  'results',
  'study',
  'progress',
];

const HOME = { slug: null, mode: null };

export function toPath({ slug, mode, finished }) {
  if (!slug) return '/';
  if (slug === 'signals') return '/signals';
  if (!mode) return `/s/${slug}`;
  if (mode === 'exam' && finished) return `/s/${slug}/exam/results`;
  return `/s/${slug}/${mode}`;
}

/**
 * The reverse, for a cold load or a Back button. Anything unrecognised — an
 * unknown slug, a subject that is still coming-soon, a stray path — opens the
 * home screen rather than an error.
 */
export function fromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return HOME;
  if (parts[0] === 'signals') return { slug: 'signals', mode: null };
  if (parts[0] !== 's' || !activeSubjects.some((s) => s.slug === parts[1])) return HOME;

  const slug = parts[1];
  // A finished paper cannot be rebuilt from an address, so /exam/results opens
  // the exam intro. App.jsx replaces the URL to match on the first sync.
  return { slug, mode: MODES.has(parts[2]) ? parts[2] : null };
}

export function screenOf({ slug, mode, finished }) {
  if (!slug) return 'home';
  if (slug === 'signals') return 'signals';
  if (!mode) return 'subject';
  if (mode === 'exam' && finished) return 'results';
  return mode;
}
