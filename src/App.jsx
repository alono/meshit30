import { useCallback, useEffect, useState } from 'react';
import { activeSubjects, loadSubject, subjects } from './subjects/loader.js';
import { summarize } from './lib/progress.js';
import { acceptTerms, hasAcceptedTerms } from './lib/storage.js';
import Disclaimer from './components/Disclaimer.jsx';
import Markdown from './components/Markdown.jsx';
import Home from './screens/Home.jsx';
import Learn from './screens/Learn.jsx';
import Practice from './screens/Practice.jsx';
import Exam from './screens/Exam.jsx';
import Results from './screens/Results.jsx';
import ProgressScreen from './screens/Progress.jsx';

const MODES = [
  { id: 'learn', title: 'שינון', sub: 'כרטיסיות מונחים בשני הכיוונים' },
  { id: 'practice', title: 'תרגול', sub: 'שאלות לפי נושא, עם משוב מיידי' },
  { id: 'exam', title: 'סימולציה', sub: 'מבחן מלא על זמן, בלי משוב עד ההגשה' },
  { id: 'study', title: 'חומר עזר', sub: 'דף הריכוז של הנושא' },
  { id: 'progress', title: 'התקדמות', sub: 'כיסוי, דיוק לפי נושא והיסטוריית מבחנים' },
];

export default function App() {
  const [slug, setSlug] = useState(null);
  const [mode, setMode] = useState(null);
  const [subject, setSubject] = useState(null);
  const [finished, setFinished] = useState(null);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState({});
  const [accepted, setAccepted] = useState(hasAcceptedTerms);

  // Home-screen figures for every active subject, refreshed whenever we return.
  const refreshOverview = useCallback(async () => {
    const entries = await Promise.all(
      activeSubjects.map(async (s) => {
        try {
          const loaded = await loadSubject(s.slug);
          return [s.slug, { ...summarize(loaded), poolSize: loaded.questions.length }];
        } catch {
          return [s.slug, null];
        }
      }),
    );
    setOverview(Object.fromEntries(entries.filter(([, v]) => v)));
  }, []);

  useEffect(() => { refreshOverview(); }, [refreshOverview]);

  useEffect(() => {
    if (!slug) { setSubject(null); return; }
    let live = true;
    loadSubject(slug)
      .then((s) => live && setSubject(s))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [slug]);

  const goHome = () => { setSlug(null); setMode(null); setFinished(null); refreshOverview(); };
  const goMenu = () => { setMode(null); setFinished(null); refreshOverview(); };

  const title = !slug
    ? 'משיט 30'
    : `${subjects.find((s) => s.slug === slug)?.he ?? ''}${mode ? ` · ${MODES.find((m) => m.id === mode)?.title}` : ''}`;

  // Nothing else mounts until the disclaimer is accepted. Placed after every
  // hook above so the hook order stays stable across the two branches.
  if (!accepted) {
    return (
      <Disclaimer
        onAccept={() => {
          acceptTerms();
          setAccepted(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        {(slug || mode) && (
          <button type="button" className="back" onClick={mode ? goMenu : goHome}>
            ← חזרה
          </button>
        )}
        <h1>{title}</h1>
      </header>

      {error && <p className="notice">שגיאה בטעינת התוכן: {error}</p>}

      {!slug && <Home progress={overview} onOpen={setSlug} />}

      {slug && !subject && !error && <p className="meta">טוען…</p>}

      {subject && !mode && <SubjectMenu subject={subject} stats={overview[subject.slug]} onPick={setMode} />}

      {subject && mode === 'learn' && <Learn subject={subject} />}
      {subject && mode === 'practice' && <Practice subject={subject} />}
      {subject && mode === 'study' && <Markdown source={subject.cheatsheet} />}
      {subject && mode === 'progress' && (
        <ProgressScreen subject={subject} stats={summarize(subject)} />
      )}

      {subject && mode === 'exam' && !finished && (
        <Exam subject={subject} onFinish={setFinished} />
      )}
      {subject && mode === 'exam' && finished && (
        <Results
          subject={subject}
          attempt={finished.attempt}
          result={finished.result}
          onAgain={() => setFinished(null)}
          onHome={goMenu}
        />
      )}

      {subject && !mode && (
        <p className="meta" style={{ marginTop: 24 }}>מקור המאגר: {subject.source}</p>
      )}
    </div>
  );
}

function SubjectMenu({ subject, stats, onPick }) {
  return (
    <>
      <div className="card">
        <div className="row">
          <b>{subject.questions.length} שאלות במאגר</b>
          <span style={{ flex: 1 }} />
          <span className="pill">
            {subject.exam.questions} שאלות · {subject.exam.minutes} דק' · עובר {subject.exam.pass}
          </span>
        </div>
        {stats && (
          <>
            <div className="bar" style={{ marginTop: 10 }}>
              <i style={{ width: `${Math.round(stats.coverage * 100)}%` }} />
            </div>
            <p className="meta">
              כיסוי {Math.round(stats.coverage * 100)}%
              {stats.wrongCount > 0 && ` · ${stats.wrongCount} שאלות ממתינות לתרגול חוזר`}
            </p>
          </>
        )}
      </div>

      {MODES.map((m) => (
        <button key={m.id} type="button" className="tile" onClick={() => onPick(m.id)}>
          <div className="title">{m.title}</div>
          <div className="sub">{m.sub}</div>
        </button>
      ))}
    </>
  );
}
