import QuestionCard from '../components/QuestionCard.jsx';

const pct = (n) => `${Math.round(n * 100)}%`;

/** תוצאות — score, pass banner at the subject's own mark, and the mistakes. */
export default function Results({ subject, attempt, result, onAgain, onHome }) {
  return (
    <>
      <div className={`banner ${result.passed ? 'pass' : 'fail'}`}>
        {result.passed ? 'עברת! 🎉' : 'לא עברת הפעם'}
        <div style={{ fontSize: '2rem', marginTop: 6 }}>{result.score} / 100</div>
        <div className="meta">
          {result.right} תשובות נכונות מתוך {result.total} · ציון עובר {result.pass}
        </div>
      </div>

      <div className="card">
        <b>לפי נושא</b>
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
        <p className="meta">הנושאים החלשים ביותר מופיעים למעלה.</p>
      </div>

      <div className="row">
        {onAgain && (
          <button type="button" className="btn" onClick={onAgain}>סימולציה נוספת</button>
        )}
        <button type="button" className="btn ghost" onClick={onHome}>
          {onAgain ? 'חזרה לתפריט' : 'חזרה להתקדמות'}
        </button>
      </div>

      <h2 style={{ marginTop: 28 }}>
        {result.mistakes.length ? `הטעויות (${result.mistakes.length})` : 'ללא טעויות 🎯'}
      </h2>
      {result.mistakes.map((row) => (
        <QuestionCard
          key={row.id}
          question={subject.byId.get(row.id)}
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
