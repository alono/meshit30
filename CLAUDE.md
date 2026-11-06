# Meshit 30 Trainer

Offline-first exam trainer for Israel's Meshit 30 boat-operator theory exams. It is a React and
Vite single-page app with no accounts, deployed to Cloudflare Pages. Learner progress stays in
`localStorage`. The UI is Hebrew and right-to-left, and three exams also have English editions.

People rely on this content for a real licensing exam, so **a wrong answer is the worst possible
bug**.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on port 5173, including the content editor at `/admin` |
| `npm run content` | Rebuild derived content for all subjects, then validate it |
| `npm run check:theme` | Enforce the theming contract |
| `npm test` | Unit tests for exam, spaced-repetition and answer-checking logic |
| `npm run build` | Production build and service worker |

Run the commands that cover your change before calling it done. CI runs all of them except `dev`.

## Layout

| Path | Contents |
|---|---|
| `subjects/` | One folder per exam, plus `manifest.json`. Format: [`subjects/README.md`](subjects/README.md) |
| `src/lib/` | Framework-free logic: exam papers, Leitner, open-answer checking, progress, i18n |
| `src/screens/`, `src/components/` | React UI |
| `scripts/` | Content build, validators, service worker generator, dev-only admin server |
| `functions/api/v.js` | Cloudflare Pages Function for the usage beacon. See [`analytics/README.md`](analytics/README.md) |
| `data/` | Source PDFs from the official publisher |
| `test/` | Unit tests, run with Node's built-in test runner |

## Rules

**Content**

- Question ids are immutable. Progress and overrides key off them, so a renumber silently corrupts
  every learner's data.
- Never hand-edit `terms.json`, `display.json` or `repairs.report.txt`. Edit the source files and
  run `npm run content`, then commit sources and derived files together. CI fails on a stale commit.
- Automatic text repair may only change spaces and quotes, never a Hebrew letter.
  `build-display.mjs` crashes if that is broken. Any hand-written wording must be marked
  `reconstructed`.
- Never change an answer on a hunch. Verify it against the source and record the reason in the
  commit message.

**Code**

- Adding or updating a subject is a content change. Topics and exam parameters come from data, so
  never hardcode them.
- Screen text for English editions lives in `src/lib/i18n.js`. Screens never branch on language.
- Keep `src/lib/open.js` free of browser and React dependencies, because the validator imports it.
- `functions/api/v.js` keeps its own copy of the screen list from `src/lib/route.js`. Change both.
- Analytics records only date, device id, screen and subject. Never add answers, scores or IP
  addresses.
- Avoid new dependencies. The app has two runtime dependencies, React and React DOM.

## Skills

Read the matching skill before starting these tasks:

| Task | Skill |
|---|---|
| CSS, colours, light or dark mode, new components that need styling | [`theming`](.claude/skills/theming/SKILL.md) |
| Merging a new official PDF into an existing subject | [`update-questions`](.claude/skills/update-questions/SKILL.md) |

## Deployment

Every push to `master` deploys to production at <https://meshit30.pages.dev>. Work on a branch.
