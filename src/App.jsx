import { useCallback, useEffect, useRef, useState } from 'react';
import { activeSubjects, getSubjectMeta, loadSubject } from './subjects/loader.js';
import { summarize } from './lib/progress.js';
import { sendView } from './lib/analytics.js';
import { fromPath, screenOf, toPath } from './lib/route.js';
import { acceptTerms, hasAcceptedTerms } from './lib/storage.js';
import { applyTheme, readTheme, saveTheme } from './lib/theme.js';
import { strings, subjectTitle } from './lib/i18n.js';
import Disclaimer from './components/Disclaimer.jsx';
import ThemeControl from './components/ThemeControl.jsx';
import Markdown from './components/Markdown.jsx';
import Home from './screens/Home.jsx';
import Learn from './screens/Learn.jsx';
import Practice from './screens/Practice.jsx';
import Exam from './screens/Exam.jsx';
import Results from './screens/Results.jsx';
import OpenPractice from './screens/OpenPractice.jsx';
import OpenExam from './screens/OpenExam.jsx';
import OpenResults from './screens/OpenResults.jsx';
import ProgressScreen from './screens/Progress.jsx';
import Signals from './screens/Signals.jsx';
import Browse from './screens/Browse.jsx';

// Titles come from the subject's language (i18n.js). A subject without a
// cheatsheet — an English edition, so far — has no deck and no study sheet.
const MODES = [
  { id: 'learn', needs: (s) => s.terms.length > 0 },
  { id: 'practice' },
  { id: 'exam' },
  { id: 'study', needs: (s) => Boolean(s.cheatsheet) },
  { id: 'browse' },
  { id: 'progress' },
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

  // A shared link can name a screen this subject does not have (/learn on an
  // English edition); fall back to its menu.
  useEffect(() => {
    const m = MODES.find((x) => x.id === mode);
    if (subject && m?.needs && !m.needs(subject)) setMode(null);
  }, [subject, mode]);

  const goHome = () => { setSlug(null); setMode(null); setFinished(null); refreshOverview(); };
  const goMenu = () => { setMode(null); setFinished(null); refreshOverview(); };

  // Known from the manifest before the subject itself has loaded, so the
  // header and the reading direction are right from the first frame.
  const meta = slug && slug !== 'signals' ? getSubjectMeta(slug) : null;
  const t = strings(meta?.lang);

  const title =
    slug === 'signals'
      ? 'אורות וסימנים'
      : !slug
        ? 'משיט 30'
        : `${meta ? subjectTitle(meta) : ''}${mode ? ` · ${t.modes[mode]?.[0]}` : ''}`;

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
    <div className="app" dir={t.dir} lang={meta?.lang ?? 'he'}>
      <header className="topbar">
        {/* The arrow points the way the text starts: right in Hebrew, left in
            an English subject. */}
        {(slug || mode) && (
          <button type="button" className="back" onClick={mode ? goMenu : goHome}>
            {t.back}
          </button>
        )}
        <h1>{title}</h1>
        <span className="spacer" />
        <ThemeControl theme={theme} onChange={changeTheme} variant="cycle" />
      </header>

      {error && <p className="notice">{t.loadError(error)}</p>}

      {!slug && (
        <Home progress={overview} onOpen={setSlug} theme={theme} onThemeChange={changeTheme} />
      )}

      {slug === 'signals' && <Signals />}

      {slug && slug !== 'signals' && !subject && !error && <p className="meta">{t.loading}</p>}

      {subject && !mode && <SubjectMenu subject={subject} stats={overview[subject.slug]} onPick={setMode} />}

      {/* Open (chart-work) subjects swap in their own practice/exam/results;
          every other screen is shared. */}
      {subject && mode === 'learn' && <Learn subject={subject} />}
      {subject && mode === 'practice' &&
        (subject.kind === 'open' ? <OpenPractice subject={subject} /> : <Practice subject={subject} />)}
      {subject && mode === 'study' && <Markdown source={subject.cheatsheet} />}
      {subject && mode === 'browse' && <Browse subject={subject} />}
      {subject && mode === 'progress' && <ProgressScreen subject={subject} />}

      {subject && mode === 'exam' && !finished &&
        (subject.kind === 'open' ? (
          <OpenExam subject={subject} onFinish={setFinished} />
        ) : (
          <Exam subject={subject} onFinish={setFinished} />
        ))}
      {subject && mode === 'exam' && finished &&
        (subject.kind === 'open' ? (
          <OpenResults
            subject={subject}
            attempt={finished.attempt}
            result={finished.result}
            onAgain={() => setFinished(null)}
            onHome={goMenu}
          />
        ) : (
          <Results
            subject={subject}
            attempt={finished.attempt}
            result={finished.result}
            onAgain={() => setFinished(null)}
            onHome={goMenu}
          />
        ))}

      {subject && !mode && (
        <p className="meta" style={{ marginTop: 24 }}>{t.source(subject.source)}</p>
      )}
    </div>
  );
}

function SubjectMenu({ subject, stats, onPick }) {
  const t = strings(subject.lang);
  return (
    <>
      <div className="card">
        <div className="row">
          <b>{t.poolSize(subject.questions.length)}</b>
          <span style={{ flex: 1 }} />
          <span className="pill">
            {t.examPill(subject.exam.questions, subject.kind === 'open', subject.exam.minutes, subject.exam.pass)}
          </span>
        </div>
        {stats && (
          <>
            <div className="bar" style={{ marginTop: 10 }}>
              <i style={{ width: `${Math.round(stats.coverage * 100)}%` }} />
            </div>
            <p className="meta">
              {t.coverage(Math.round(stats.coverage * 100))}
              {stats.wrongCount > 0 && t.waiting(stats.wrongCount)}
            </p>
          </>
        )}
      </div>

      {MODES.filter((m) => !m.needs || m.needs(subject)).map((m) => (
        <button key={m.id} type="button" className="tile" onClick={() => onPick(m.id)}>
          <div className="title">{t.modes[m.id][0]}</div>
          <div className="sub">{t.modes[m.id][1]}</div>
        </button>
      ))}
    </>
  );
}
