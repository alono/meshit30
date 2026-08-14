import { useState } from 'react';
import { RESETTABLE, resetArea, resetSubject, summarize } from '../lib/progress.js';
import { buildAttempt, scoreAttempt } from '../lib/exam.js';
import Results from './Results.jsx';

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/** התקדמות — pool coverage, per-topic accuracy, attempt history, and resets. */
export default function Progress({ subject }) {
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
      replay.questionIds && replay.optionOrder
        ? { seed: replay.seed, questionIds: replay.questionIds, optionOrder: replay.optionOrder }
        : buildAttempt(subject, replay.seed);
    const result = scoreAttempt(subject, attempt, replay.answers ?? {});
    return (
      <Results subject={subject} attempt={attempt} result={result} onHome={() => setReplay(null)} />
    );
  }

  return (
    <>
      <div className="card">
        <b>כיסוי המאגר</b>
        <div className="bar" style={{ margin: '10px 0' }}>
          <i style={{ width: pct(stats.coverage) }} />
        </div>
        <p className="meta">
          תרגלת {stats.totalSeen} מתוך {subject.questions.length} שאלות · דיוק כולל {pct(stats.accuracy)} ·
          {' '}{stats.learned} כרטיסיות שינון בקופסה האחרונה
        </p>
      </div>

      <div className="card">
        <b>סימולציות</b>
        {attempts.length === 0 ? (
          <p className="meta">טרם ביצעת סימולציה.</p>
        ) : (
          <>
            <p className="meta">
              {attempts.length} ניסיונות · הציון הגבוה ביותר {stats.best} ·{' '}
              {stats.streak > 0 ? `${stats.streak} עוברות ברצף` : 'אין רצף פעיל'} · ציון עובר{' '}
              {subject.exam.pass}
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
                    <td className="meta">{new Date(a.at).toLocaleDateString('he-IL')}</td>
                    <td className="num">
                      <b>{a.score}</b> / 100 {a.passed ? '✓' : ''}
                    </td>
                    <td className="num">
                      <button type="button" className="chip" onClick={() => setReplay(a)}>
                        צפייה
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
        <b>דיוק לפי נושא</b>
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
        <p className="meta">העמודה האחרונה: כמה שאלות מהנושא כבר ראית.</p>
      </div>

      <ResetPanel subject={subject} onChange={refresh} />
    </>
  );
}

function ResetPanel({ subject, onChange }) {
  // Which row is awaiting confirmation. Resets are irreversible, so nothing
  // happens on the first press.
  const [pending, setPending] = useState(null);

  const run = (action) => {
    action();
    setPending(null);
    onChange();
  };

  const rows = RESETTABLE.map((area) => ({ ...area, n: area.count(subject.slug) }));
  const total = rows.reduce((sum, r) => sum + r.n, 0);

  return (
    <div className="card">
      <b>איפוס התקדמות</b>
      <p className="meta">
        אפשר לאפס כל חלק בנפרד. הנתונים נשמרים במכשיר הזה בלבד, והאיפוס אינו ניתן לביטול —
        כדאי לייצא גיבוי מהמסך הראשי לפני איפוס.
      </p>

      <table className="topics">
        <tbody>
          {rows.map((area) => (
            <tr key={area.id}>
              <td>
                {area.he}
                <div className="meta">{area.note}</div>
                {pending === area.id && (
                  <div className="notice" style={{ marginTop: 8 }}>
                    לאפס {area.n} {area.unit}? הפעולה אינה ניתנת לביטול.
                  </div>
                )}
              </td>
              <td className="num meta">{area.n} {area.unit}</td>
              <td className="num">
                {pending === area.id ? (
                  <span className="row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="chip" onClick={() => setPending(null)}>
                      ביטול
                    </button>
                    <button
                      type="button"
                      className="chip danger"
                      onClick={() => run(() => resetArea(subject.slug, area.id))}
                    >
                      אישור האיפוס
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="chip"
                    disabled={area.n === 0}
                    onClick={() => setPending(area.id)}
                  >
                    איפוס
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
              לאפס את כל ההתקדמות בנושא {subject.he}? כל ארבעת החלקים יימחקו. שאר הנושאים לא ייפגעו.
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn ghost" onClick={() => setPending(null)}>
              ביטול
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => run(() => resetSubject(subject.slug))}
            >
              אישור האיפוס
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn ghost"
            disabled={total === 0}
            onClick={() => setPending('all')}
          >
            איפוס הכול בנושא זה
          </button>
        )}
      </div>
    </div>
  );
}
