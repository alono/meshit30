import { useEffect, useRef, useState } from 'react';
import { subjects } from '../subjects/loader.js';
import { exportAll, importAll } from '../lib/storage.js';

/**
 * The subject picker. All four exams are listed from day one — the three that
 * have no question pool yet appear as בקרוב, so the shape of the whole licence
 * is visible from the start.
 */
export default function Home({ progress, onOpen }) {
  const [message, setMessage] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const download = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meshit30-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const n = importAll(await file.text());
      setMessage(`יובאו נתונים מ-${n} רשומות. יש לרענן את הדף כדי לראות את ההתקדמות.`);
    } catch (err) {
      setMessage(`הייבוא נכשל: ${err.message}`);
    }
  };

  return (
    <>
      <p className="meta">ארבעת מבחני התיאוריה של רישיון משיט 30. יש לבחור נושא כדי להתחיל.</p>

      {subjects.map((s) => {
        const stats = progress[s.slug];
        const ready = s.status === 'active';
        return (
          <button
            key={s.slug}
            type="button"
            className="tile"
            disabled={!ready}
            onClick={() => ready && onOpen(s.slug)}
          >
            <div className="row">
              <span className="title">{s.icon} {s.he}</span>
              <span className="spacer" style={{ flex: 1 }} />
              {!ready && <span className="pill">בקרוב</span>}
            </div>
            {ready && stats ? (
              <>
                <div className="sub">
                  נלמדו {stats.totalSeen} שאלות מתוך {stats.poolSize} · דיוק{' '}
                  {stats.accuracy == null ? '—' : `${Math.round(stats.accuracy * 100)}%`}
                  {stats.streak > 0 && ` · ${stats.streak} סימולציות עוברות ברצף`}
                </div>
                <div className="bar" style={{ marginTop: 8 }}>
                  <i style={{ width: `${Math.round(stats.coverage * 100)}%` }} />
                </div>
              </>
            ) : (
              <div className="sub">{ready ? 'טרם התחלת' : 'מאגר השאלות טרם נוסף'}</div>
            )}
          </button>
        );
      })}

      <div className="card">
        <b>גיבוי ושחזור</b>
        <p className="meta">כל ההתקדמות נשמרת במכשיר בלבד. הקובץ כולל את כל הנושאים יחד.</p>
        <div className="row">
          <button type="button" className="btn ghost" onClick={download}>ייצוא לקובץ</button>
          <button type="button" className="btn ghost" onClick={() => fileInput.current?.click()}>
            ייבוא מקובץ
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={upload}
          />
        </div>
        {message && <p className="notice info" style={{ marginTop: 12 }}>{message}</p>}
      </div>
    </>
  );
}
