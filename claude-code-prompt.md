# פרומפט לקלוד קוד — Meshit 30 Exam Trainer (multi-subject)

העתק את הטקסט שמתחת לקו לתוך Claude Code. מבנה תיקייה התחלתי:

```
meshit30-trainer/
└── subjects/
    └── mechonaut/
        ├── questions.json
        └── cheatsheet.md      ← זה cheatsheet-mechonaut.md, בשם אחיד
```

---

Build a single-page exam trainer web app for the Israeli RASPAN Meshit-30 theory exams. My wife is a new immigrant (native English speaker) preparing to take the exams in Hebrew — the app must teach her the Hebrew technical terms, not just drill answers.

## Multi-subject architecture — this is a core requirement

Meshit 30 has four theory exams. I'm starting with one (מכונאות / Mechanics) and will add the others as I obtain their official question pools: ימאות ג' (Seamanship), ניווט ב' — מכשירים (Instrument Navigation), and ניווט חופי (Coastal Navigation). Design the app so that adding a subject is a pure content drop — zero code changes.

- Content lives in `subjects/<slug>/` with a fixed contract per subject:
  - `questions.json` — `{source, exam: {questions, points_per_question, pass, minutes}, count, questions: [{id, topic, question, options: {א,ב,ג,ד}, correct, note?}]}`. Topics differ per subject; derive topic lists from the data, never hardcode them.
  - `cheatsheet.md` — bilingual reference, rendered in the subject's Study tab.
  - `translations.json` — generated (see below).
- A `subjects/manifest.json` lists slug, Hebrew name, English name, and status (`active` / `coming-soon`). Home screen is a subject picker showing per-subject progress; the three future subjects appear as coming-soon cards so the structure is visible from day one.
- Exam parameters (question count, pass mark, duration) come from each subject's `exam` block — they differ between subjects (מכונאות is 50q/60min/pass 84; others have different durations).
- All progress in localStorage is namespaced per subject and versioned, so adding subjects never corrupts existing progress. Export/import covers all subjects in one file.
- Note for later: ניווט חופי includes chart-work calculations, so its questions may eventually need an optional `image` field on the question schema. Support an optional image path now (render if present) so the schema doesn't need a breaking change.

## Data
- `subjects/mechonaut/questions.json`: 178 questions, official RASPAN pool. Treat it as the source of truth; never mutate it.
- `subjects/mechonaut/cheatsheet.md`: bilingual reference.

## Stack
Vite + React, RTL layout, Hebrew UI with English subtitles on every control. No backend. Mobile-first — she'll use her phone.

## First task: translation pass
Before building UI, generate `subjects/mechonaut/translations.json`: for every question id, an English translation of the question and each option, plus a `terms` array of the Hebrew technical terms it contains (e.g. גל ארכובה → crankshaft). Derive the term dictionary from the cheat sheet. Make this a reusable script (`scripts/`) I can run for each future subject, and structure the shared term dictionary per subject. I will review the file before we continue.

## Three modes (per subject)
1. **שינון | Learn** — flashcards of the subject's term dictionary (Hebrew ↔ English, flip card), filterable by topic, with "know / don't know" spaced repetition (simple Leitner, 3 boxes).
2. **תרגול | Practice** — questions by topic. Immediate feedback after each answer; on wrong answer show the correct one plus the relevant cheat-sheet snippet. Every question has an "EN" toggle that reveals the English translation inline, and long-press/hover on underlined Hebrew terms shows the English term. Wrong answers enter a review queue ("תרגלי שוב את מה שטעית בו").
3. **סימולציה | Exam** — random questions per the subject's `exam` block, weighted to mirror the pool's topic distribution, countdown timer, options shuffled every run (seeded per attempt), no feedback until submit. Results screen: score /100, pass banner per the subject's pass mark, per-topic breakdown, review of mistakes, and attempt history chart.

## Details that matter
- Shuffle both question order and option order per attempt; store the seed so an attempt can be reviewed.
- Questions with a `note` field: show the note in practice mode only (they are source-document quirks).
- Progress dashboard per subject: pool coverage, per-topic accuracy, streak of passing exam attempts; plus an overall home-screen view across subjects.
- Accessibility: large touch targets, keyboard 1-4/א-ד to answer.

Start by reading the mechonaut files, then propose the component structure and the subject-loading mechanism before writing code.
