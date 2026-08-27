import OpenQuestionCard from '../components/OpenQuestionCard.jsx';

const pct = (n) => `${Math.round(n * 100)}%`;

/**
 * תוצאות for an open paper. The score counts parts, not exercises — one
 * chart-work exercise is several independent results — so the banner says so.
 */
export default function OpenResults({ subject, attempt, result, onAgain, onHome }) {
  return (
    <>
      <div className={`banner ${result.passed ? 'pass' : 'fail'}`}>
        {result.passed ? 'עברת! 🎉' : 'לא עברת הפעם'}
        <div style={{ fontSize: '2rem', marginTop: 6 }}>{result.score} / 100</div>
        <div className="meta">
          {result.right} סעיפים נכונים מתוך {result.total} · ציון עובר {result.pass}
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
        <p className="meta">הספירה היא לפי סעיפים; הנושאים החלשים ביותר מופיעים למעלה.</p>
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
        {result.mistakes.length ? `תרגילים עם טעויות (${result.mistakes.length})` : 'ללא טעויות 🎯'}
      </h2>
      {result.mistakes.map((row) => (
        <OpenQuestionCard
          key={row.id}
          question={subject.byId.get(row.id)}
          terms={subject.termsById}
          reveal
          verdicts={row.given}
          showNote
        />
      ))}
    </>
  );
}
