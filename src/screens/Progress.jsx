const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/** התקדמות — pool coverage, per-topic accuracy, and the attempt history. */
export default function Progress({ subject, stats }) {
  const { attempts } = stats;
  const top = Math.max(100, ...attempts.map((a) => a.score));

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
    </>
  );
}
