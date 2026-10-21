import QuestionCard from '../components/QuestionCard.jsx';
import { strings } from '../lib/i18n.js';

const pct = (n) => `${Math.round(n * 100)}%`;

/** תוצאות — score, pass banner at the subject's own mark, and the mistakes. */
export default function Results({ subject, attempt, result, onAgain, onHome }) {
  const t = strings(subject.lang);
  return (
    <>
      <div className={`banner ${result.passed ? 'pass' : 'fail'}`}>
        {result.passed ? t.passed : t.failed}
        <div style={{ fontSize: '2rem', marginTop: 6 }}>{result.score} / 100</div>
        <div className="meta">
          {t.rightOf(result.right, result.total, result.pass)}
        </div>
      </div>

      {/* A wrong answer on a rule-of-the-road question fails the paper on its
          own, so the reason has to be said outright — otherwise a score above
          the pass mark next to "לא עברת" reads as a bug. */}
      {result.criticalMisses?.length > 0 && (
        <p className="notice">
          {t.disqualified(result.criticalMisses.length, result.criticalRule?.label, result.criticalRule?.note)}
        </p>
      )}

      <div className="card">
        <b>{t.byTopic}</b>
        <table className="topics">
          <tbody>
            {result.byTopic.map((t) => (
              <tr key={t.topic}>
                <td>{t.topic}</td>
                <td style={{ width: '40%' }}>
                  <div className="bar"><i style={{ width: pct(t.right / t.total) }} /></div>
                </td>
                <td className="num">{t.right}/{t.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">{t.weakestFirst}</p>
      </div>

      <div className="row">
        {onAgain && (
          <button type="button" className="btn" onClick={onAgain}>{t.again}</button>
        )}
        <button type="button" className="btn ghost" onClick={onHome}>
          {onAgain ? t.toMenu : t.toProgress}
        </button>
      </div>

      <h2 style={{ marginTop: 28 }}>
        {result.mistakes.length ? t.mistakes(result.mistakes.length) : t.noMistakes}
      </h2>
      {result.mistakes.map((row) => (
        <QuestionCard
          key={row.id}
          question={subject.byId.get(row.id)}
          lang={subject.lang}
          order={attempt.optionOrder[row.id]}
          terms={subject.termsById}
          picked={row.given}
          reveal
          showNote
        />
      ))}
    </>
  );
}
