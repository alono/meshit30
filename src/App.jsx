import { useCallback, useEffect, useRef, useState } from 'react';
import { activeSubjects, loadSubject, subjects } from './subjects/loader.js';
import { summarize } from './lib/progress.js';
import { sendView } from './lib/analytics.js';
import { fromPath, screenOf, toPath } from './lib/route.js';
import { acceptTerms, hasAcceptedTerms } from './lib/storage.js';
import { applyTheme, readTheme, saveTheme } from './lib/theme.js';
import Disclaimer from './components/Disclaimer.jsx';
import ThemeControl from './components/ThemeControl.jsx';
import Markdown from './components/Markdown.jsx';
import Home from './screens/Home.jsx';
import Learn from './screens/Learn.jsx';
import Practice from './screens/Practice.jsx';
import Exam from './screens/Exam.jsx';
import Results from './screens/Results.jsx';
import ProgressScreen from './screens/Progress.jsx';
import Signals from './screens/Signals.jsx';

const MODES = [
  { id: 'learn', title: 'שינון', sub: 'כרטיסיות מונחים בשני הכיוונים' },
  { id: 'practice', title: 'תרגול', sub: 'שאלות לפי נושא, עם משוב מיידי' },
  { id: 'exam', title: 'סימולציה', sub: 'מבחן מלא על זמן, בלי משוב עד ההגשה' },
  { id: 'study', title: 'חומר עזר', sub: 'דף הריכוז של הנושא' },
  { id: 'progress', title: 'התקדמות', sub: 'כיסוי, דיוק לפי נושא והיסטוריית מבחנים' },
];

// Where this load started, read once before React mounts, so a shared link or
// a refresh reopens the same screen.
const opened = fromPath(window.location.pathname);

export default function App() {
  const [slug, setSlug] = useState(opened.slug);
  const [mode, setMode] = useState(opened.mode);
  const [subject, setSubject] = useState(null);
  const [finished, setFinished] = useState(null);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState({});
  const [accepted, setAccepted] = useState(hasAcceptedTerms);
  const [theme, setTheme] = useState(readTheme);

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

  useEffect(() => { applyTheme(theme); }, [theme]);

  const changeTheme = (next) => { saveTheme(next); setTheme(next); };

  // The address bar follows the screen, and each screen change is one analytics
  // line. Both live here so there is exactly one place a screen is named.
  const synced = useRef(false);
  useEffect(() => {
    if (!accepted) return;  // nothing is recorded before the notice is accepted
    const here = { slug, mode, finished };
    const path = toPath(here);
    if (path !== window.location.pathname) {
      // The first sync only corrects the address (a cold load of …/exam/results
      // has no paper to show), so it must not leave a Back-button trap behind.
      window.history[synced.current ? 'pushState' : 'replaceState'](null, '', path);
    }
    synced.current = true;
    sendView(screenOf(here), slug === 'signals' ? null : slug);
  }, [accepted, slug, mode, finished]);

  // Back and Forward move between screens instead of leaving the app.
  useEffect(() => {
    const onPop = () => {
      const next = { ...fromPath(window.location.pathname), finished: null };
      // Several addresses can lead to one screen — …/exam/results reopens the
      // exam intro, since a handed-in paper cannot be restored. When they do,
      // the state below does not change, React skips the sync effect, and the
      // address would be left describing a screen that is not on show.
      const path = toPath(next);
      if (path !== window.location.pathname) window.history.replaceState(null, '', path);
      setSlug(next.slug);
      setMode(next.mode);
      setFinished(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!slug || slug === 'signals') { setSubject(null); return; }
    let live = true;
    loadSubject(slug)
      .then((s) => live && setSubject(s))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [slug]);

  const goHome = () => { setSlug(null); setMode(null); setFinished(null); refreshOverview(); };
  const goMenu = () => { setMode(null); setFinished(null); refreshOverview(); };

  const title =
    slug === 'signals'
      ? 'אורות וסימנים'
      : !slug
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
        {/* The arrow points right: in an RTL layout "back" is towards the right,
            the side the text starts from. */}
        {(slug || mode) && (
          <button type="button" className="back" onClick={mode ? goMenu : goHome}>
            → חזרה
          </button>
        )}
        <h1>{title}</h1>
        <span className="spacer" />
        <ThemeControl theme={theme} onChange={changeTheme} variant="cycle" />
      </header>

      {error && <p className="notice">שגיאה בטעינת התוכן: {error}</p>}

      {!slug && (
        <Home progress={overview} onOpen={setSlug} theme={theme} onThemeChange={changeTheme} />
      )}

      {slug === 'signals' && <Signals />}

      {slug && slug !== 'signals' && !subject && !error && <p className="meta">טוען…</p>}

      {subject && !mode && <SubjectMenu subject={subject} stats={overview[subject.slug]} onPick={setMode} />}

      {subject && mode === 'learn' && <Learn subject={subject} />}
      {subject && mode === 'practice' && <Practice subject={subject} />}
      {subject && mode === 'study' && <Markdown source={subject.cheatsheet} />}
      {subject && mode === 'progress' && <ProgressScreen subject={subject} />}

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
