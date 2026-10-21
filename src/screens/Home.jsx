import { useEffect, useRef, useState } from 'react';
import { subjects } from '../subjects/loader.js';
import { isEnabled, setEnabled } from '../lib/analytics.js';
import { exportAll, importAll } from '../lib/storage.js';
import ThemeControl from '../components/ThemeControl.jsx';
import { strings, subjectTitle } from '../lib/i18n.js';

/**
 * The subject picker. All four exams are listed from day one — the three that
 * have no question pool yet appear as בקרוב, so the shape of the whole licence
 * is visible from the start.
 */
export default function Home({ progress, onOpen, theme, onThemeChange }) {
  const [message, setMessage] = useState(null);
  const [stats, setStats] = useState(isEnabled);
  const fileInput = useRef(null);

  const toggleStats = () => {
    const next = !stats;
    setEnabled(next);
    setStats(next);
  };

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
      <div className="brand">
        <img src="/wave-logo.png" alt="" width="64" height="64" />
        <p className="meta">ארבעת מבחני התיאוריה של רישיון משיט 30. יש לבחור נושא כדי להתחיל.</p>
      </div>

      {subjects.map((s) => {
        const stats = progress[s.slug];
        const ready = s.status === 'active';
        // An English edition's tile reads in English, left to right.
        const t = strings(s.lang);
        return (
          <button
            key={s.slug}
            type="button"
            className="tile"
            dir={t.dir}
            lang={s.lang ?? 'he'}
            disabled={!ready}
            onClick={() => ready && onOpen(s.slug)}
          >
            <div className="row">
              <span className="title">{s.icon} {subjectTitle(s)}</span>
              <span className="spacer" style={{ flex: 1 }} />
              {!ready && <span className="pill">בקרוב</span>}
            </div>
            {ready && stats ? (
              <>
                <div className="sub">
                  {t.tileStats(stats.totalSeen, stats.poolSize, stats.accuracy == null ? '—' : `${Math.round(stats.accuracy * 100)}%`)}
                  {stats.streak > 0 && t.tileStreak(stats.streak)}
                </div>
                <div className="bar" style={{ marginTop: 8 }}>
                  <i style={{ width: `${Math.round(stats.coverage * 100)}%` }} />
                </div>
              </>
            ) : (
              <div className="sub">{ready ? t.notStarted : 'מאגר השאלות טרם נוסף'}</div>
            )}
          </button>
        );
      })}

      <button type="button" className="tile" onClick={() => onOpen('signals')}>
        <div className="row">
          <span className="title">🔦 אורות וסימנים</span>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="pill">127 תמונות</span>
        </div>
        <div className="sub">חוברת העזר הרשמית: זיהוי אורות, סימני יום, דגלים ואותות קוליים</div>
      </button>

      <ThemeControl theme={theme} onChange={onThemeChange} variant="picker" />

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

      <div className="card">
        <b>נתוני שימוש</b>
        <p className="meta">
          כדי לדעת מה עוזר ומה לא, נאסף מידע מצטבר על אילו מסכים נפתחו, יחד עם מזהה אקראי שנוצר
          במכשיר כדי לספור משתמשים חוזרים. אין עוגיות, אין שמות ואין איסוף מידע אישי — וההתקדמות
          עצמה, כולל תשובות וציונים, נשארת במכשיר ואינה נשלחת לשום מקום.
        </p>
        <div className="row">
          <span className="pill" aria-live="polite">{stats ? 'האיסוף פעיל' : 'האיסוף כבוי'}</span>
          <span className="spacer" style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={toggleStats}>
            {stats ? 'כיבוי האיסוף' : 'הפעלת האיסוף'}
          </button>
        </div>
      </div>

      <p className="meta sources">
        המקור הרשמי לכל מאגרי השאלות:{' '}
        <a href="https://www.gov.il/he/pages/exame_small_vessel" target="_blank" rel="noopener noreferrer">
          מאגר שאלות למבחני הסמכה למשיטים — רשות הספנות והנמלים
        </a>
      </p>
      <p className="meta sources">
        השתדלנו שכל התוכן יהיה מדויק ככל האפשר. מצאתם טעות? נשמח אם תכתבו לנו:{' '}
        <a href="mailto:meshit@ohad.info">meshit@ohad.info</a>
      </p>
      <p className="meta sources" dir="ltr" lang="en">
        We have tried to make everything as accurate as possible. Found a mistake? Please email{' '}
        <a href="mailto:meshit@ohad.info">meshit@ohad.info</a>
      </p>
    </>
  );
}
