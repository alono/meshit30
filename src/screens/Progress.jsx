import { useState } from 'react';
import { RESETTABLE, resetArea, resetSubject, summarize } from '../lib/progress.js';
import { buildAttempt, scoreAttempt } from '../lib/exam.js';
import { scoreOpenAttempt } from '../lib/open.js';
import Results from './Results.jsx';
import OpenResults from './OpenResults.jsx';
import { strings } from '../lib/i18n.js';

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/** התקדמות — pool coverage, per-topic accuracy, attempt history, and resets. */
export default function Progress({ subject }) {
  const t = strings(subject.lang);
  // Owned here rather than passed in, so a reset can refresh the figures
  // without leaving the screen.
  const [stats, setStats] = useState(() => summarize(subject));
  const [replay, setReplay] = useState(null);
  const refresh = () => setStats(summarize(subject));

  const { attempts } = stats;
  const top = Math.max(100, ...attempts.map((a) => a.score));

  // Reviewing a past attempt: rebuild the exact paper — stored with the
  // attempt when available, deterministically re-drawn from its seed for
  // attempts recorded before the paper was stored — and re-score the stored
  // answers through the ordinary Results screen.
  if (replay) {
    const attempt =
      replay.questionIds
        ? { seed: replay.seed, questionIds: replay.questionIds, optionOrder: replay.optionOrder }
        : buildAttempt(subject, replay.seed);
    if (subject.kind === 'open') {
      const result = scoreOpenAttempt(subject, attempt, replay.answers ?? {});
      return (
        <OpenResults subject={subject} attempt={attempt} result={result} onHome={() => setReplay(null)} />
      );
    }
    const result = scoreAttempt(subject, attempt, replay.answers ?? {});
    return (
      <Results subject={subject} attempt={attempt} result={result} onHome={() => setReplay(null)} />
    );
  }

  return (
    <>
      <div className="card">
        <b>{t.poolCoverage}</b>
        <div className="bar" style={{ margin: '10px 0' }}>
          <i style={{ width: pct(stats.coverage) }} />
        </div>
        <p className="meta">
          {t.practiced(stats.totalSeen, subject.questions.length, pct(stats.accuracy))}
          {subject.terms.length > 0 && t.deckLearned(stats.learned)}
        </p>
      </div>

      <div className="card">
        <b>{t.simulations}</b>
        {attempts.length === 0 ? (
          <p className="meta">{t.noAttempts}</p>
        ) : (
          <>
            <p className="meta">
              {t.attemptsLine(attempts.length, stats.best, stats.streak, subject.exam.pass)}
            </p>
            <div className="history">
              {attempts.map((a) => (
                <i
                  key={a.at}
                  className={a.passed ? 'pass' : ''}
                  style={{ height: `${(a.score / top) * 100}%` }}
                  title={`${a.score}/100`}
                />
              ))}
            </div>
            <table className="topics" style={{ marginTop: 12 }}>
              <tbody>
                {[...attempts].reverse().slice(0, 8).map((a) => (
                  <tr key={a.at}>
                    <td className="meta">{new Date(a.at).toLocaleDateString(t.locale)}</td>
                    <td className="num">
                      <b>{a.score}</b> / 100 {a.passed ? '✓' : ''}
                    </td>
                    <td className="num">
                      <button type="button" className="chip" onClick={() => setReplay(a)}>
                        {t.view}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <b>{t.accuracyByTopic}</b>
        <table className="topics">
          <tbody>
            {stats.byTopic.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td style={{ width: '35%' }}>
                  <div className="bar">
                    <i style={{ width: t.accuracy == null ? '0%' : pct(t.accuracy) }} />
                  </div>
                </td>
                <td className="num">{pct(t.accuracy)}</td>
                <td className="num meta">{t.covered}/{t.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">{t.seenColumn}</p>
      </div>

      <ResetPanel subject={subject} onChange={refresh} />
    </>
  );
}

function ResetPanel({ subject, onChange }) {
  const t = strings(subject.lang);
  // Which row is awaiting confirmation. Resets are irreversible, so nothing
  // happens on the first press.
  const [pending, setPending] = useState(null);

  const run = (action) => {
    action();
    setPending(null);
    onChange();
  };

  // A subject with no flashcards has no deck to reset.
  const rows = RESETTABLE
    .filter((area) => area.id !== 'deck' || subject.terms.length > 0)
    .map((area) => {
      const [label, note, unit] = t.areas[area.id];
      return { ...area, label, note, unit, n: area.count(subject.slug) };
    });
  const total = rows.reduce((sum, r) => sum + r.n, 0);

  return (
    <div className="card">
      <b>{t.resetTitle}</b>
      <p className="meta">{t.resetIntro}</p>

      <table className="topics">
        <tbody>
          {rows.map((area) => (
            <tr key={area.id}>
              <td>
                {area.label}
                <div className="meta">{area.note}</div>
                {pending === area.id && (
                  <div className="notice" style={{ marginTop: 8 }}>
                    {t.resetConfirm(area.n, area.unit)}
                  </div>
                )}
              </td>
              <td className="num meta">{area.n} {area.unit}</td>
              <td className="num">
                {pending === area.id ? (
                  <span className="row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="chip" onClick={() => setPending(null)}>
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      className="chip danger"
                      onClick={() => run(() => resetArea(subject.slug, area.id))}
                    >
                      {t.confirmReset}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="chip"
                    disabled={area.n === 0}
                    onClick={() => setPending(area.id)}
                  >
                    {t.reset}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 16 }}>
        {pending === 'all' ? (
          <>
            <div className="notice" style={{ width: '100%' }}>
              {t.resetAllConfirm(subject.title)}
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn ghost" onClick={() => setPending(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => run(() => resetSubject(subject.slug))}
            >
              {t.confirmReset}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn ghost"
            disabled={total === 0}
            onClick={() => setPending('all')}
          >
            {t.resetAll}
          </button>
        )}
      </div>
    </div>
  );
}
