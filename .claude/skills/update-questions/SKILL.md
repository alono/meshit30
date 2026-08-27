---
name: update-questions
description: How to merge a NEW official question-set PDF into an existing subject's questions.json. Read this before touching any questions.json because a new PDF arrived. Triggers on - new question set, updated pool, new PDF in data/, merge questions, refresh a subject, מאגר חדש, עדכון שאלות, שאלון חדש.
---

# עדכון מאגר שאלות מ-PDF חדש

Inputs: a subject slug and the new official PDF (drop it in `data/`). The subject's
kind comes from its `questions.json`: no `kind` field means multiple choice;
`"kind": "open"` means chart-work exercises with `parts`. The merge rules are the
same for both — only the parsing shape differs.

## The three rules (fixed policy, not judgement)

1. **Content changed** — the learning material behind a question changed, so the
   old question is now wrong or misleading: fix its text/answer **under the same
   id**, or delete it outright. Never renumber the survivors.
2. **Old question still valid but absent from the new set** — **keep it.** The
   pool may exceed the new PDF; list every kept-though-absent id in the commit
   message.
3. **New questions** — add all of them, appended with ids `max+1…`, and verify
   their answers like any fresh transcription.

For questions that match unchanged: keep the committed wording. Do not churn text
to the new PDF's variant unless it repairs known damage.

**Why ids are immutable:** learner progress (`meshit30:v1:<slug>:answers/wrong/attempts`
in localStorage) and `text-overrides.json` both key off question ids. A renumber
silently corrupts every device's progress. This is also why the validator treats
id gaps as a warning, not an error.

## 1. Extraction — the hazards checklist

- `pdftotext -layout` first (installed at `/opt/homebrew/bin/`); render pages with
  `pdftoppm -png -r 150` and treat the **rendered page as authoritative** — the
  text layer lies in known ways:
  - Bidi controls (U+200E/F, U+202A–202E, U+2066–2069) — strip before parsing.
  - LTR islands (coordinates, `C/C=169°`, Latin names) arrive in **visual order**
    inside RTL lines — reorder token by token and re-read against the image.
  - Font-cmap lies: in `data/sq6.pdf` the digit 0 extracts as 1. Detect by digit
    distribution sanity on the answer key and by eyeballing a rendered page
    against the extraction before trusting any number.
  - Glyph zoo for minutes/degrees (`’ ׳ ° º ⁰`) — normalize to `'` and `°`.
- **Answer-key grids** (MC subjects) print as columns and are prone to row-order
  traps: the ימאות key printed two rows labelled "253" and never printed 252
  (resolved in commit 242413a by strict row order plus semantic confirmation).
  Parse column-wise, assert the id sequence, and hand-check every anomaly.

## 2. Matching new ↔ old

- Normalize stems (strip whitespace runs, punctuation, quote variants), then:
  exact stem match → **same question**; strong token-overlap reviewed by hand →
  **changed**; unmatched new → **new**; unmatched old → **dropped-from-source**.
- Open subjects: match on stem plus part structure, and classify per part — a
  changed sub-part is a "changed" question.
- Every *changed* classification gets read side by side before deciding: is the
  old one now wrong (rule 1) or merely reworded (keep committed text)?

## 3. Answer verification

- Key length must equal question count; every id covered exactly once.
- Duplicate stems must agree with each other across old+new (the nav-instruments
  import cross-checked q6/q170, q33/34/176, q53/171 this way — commit a73022c).
- Semantic spot checks on ~5% of questions, favouring ones whose key CHANGED:
  a changed key is either a genuine rule-1 content update or an off-by-one smell.
  Investigate each individually; never bulk-accept a shifted key.
- Open subjects: recompute a few calculation answers (ETA = distance/speed,
  dipping distance 2.08(√h₁+√h₂), tide clearance sums, a CADET conversion against
  the deviation table).

## 4. Content-layer hygiene

- `text-overrides.json`: for every override id, confirm the question still exists
  and the damaged text it patches is still there — a replaced question makes its
  override stale; drop it. Keep the `repair` flag as it is.
- `cheatsheet.md` / `term-overrides.json`: grep genuinely new terminology from
  added/changed questions; extend the relevant section or add aliases. Watch
  `build-display`'s "terms tagged on X/Y" line for newly untagged questions.
- New Latin tokens on card faces are legitimate only if the new pool prints them
  (the validator enforces this).

## 5. The gate

```sh
npm run content        # build-terms → build-display → validate, all active subjects
```

- Review `repairs.report.txt` and the `display.json` diff — every text change
  must be explainable.
- Update `count`, and the manifest only if the subject's status changes.
- After committing: `git status --porcelain -- subjects/` must be empty (CI
  staleness gate re-runs the build and fails the deploy on drift).

## 6. Commit convention

Title: `Update <subject> pool from data/<pdf> — +N new, M changed, K removed, J kept though absent`

Body: a judgement-call log in the style of commits a73022c / 242413a — every
changed answer key with its reason, every kept-though-absent id, every deletion
with why the material changed, every reconstruction, and how the key was
verified. The next update leans on this log the way this one leans on theirs.
