# Contributing

The most useful contribution is a report of a wrong answer or damaged question. People use this
app to prepare for a real licensing exam, so content errors matter more than anything else here.

## Report a content error

[Open a content error issue](https://github.com/alono/meshit30/issues/new?template=content-error.yml)
or email [meshit@ohad.info](mailto:meshit@ohad.info). Include the subject, the question text, and
where the correct answer comes from.

## Set up

Requires Node.js 20 or later.

```sh
npm install
npm run dev     # http://localhost:5173
```

To edit content, open `/admin` on the dev server. Each save updates the source file, rebuilds the
derived files, and validates the subject. If validation fails, the edit is rolled back.

> **Note:** the dev server listens on your local network so you can test on a phone, and `/admin`
> accepts requests from private network addresses. Only run it on a network you trust.

## Rules that protect the content

- **Never renumber a question.** Learner progress and text overrides are keyed by question id.
- **Never edit derived files by hand.** `terms.json`, `display.json` and `repairs.report.txt` are
  generated. Edit `questions.json`, `cheatsheet.md` or the override files, then run
  `npm run content`.
- **Commit derived files with their sources.** CI fails if regenerating them changes anything.
- **Use theme tokens for every colour.** A literal colour can only be right in one of the three
  appearance states.

The file formats are documented in [`subjects/README.md`](subjects/README.md) (Hebrew).

## Before you open a pull request

```sh
npm run content        # rebuild and validate all subjects
npm run check:theme    # enforce the theming contract
npm test               # unit tests
npm run build          # production build and service worker
```

CI runs the same checks on every pull request. Explain any answer change in the pull request,
including its source.

## License

Code contributions are accepted under the [MIT License](LICENSE). Exam content is not covered by
that license. See [`NOTICE.md`](NOTICE.md).
