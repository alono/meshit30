import { useEffect, useMemo, useState } from 'react';
import QuestionCard from '../components/QuestionCard.jsx';
import OpenQuestionCard from '../components/OpenQuestionCard.jsx';
import { activeSubjects, fold, getSubjectMeta } from '../subjects/loader.js';

const OPTION_KEYS = ['א', 'ב', 'ג', 'ד'];

const api = async (path, init) => {
  const res = await fetch(`/__admin/${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
};

/**
 * Local content admin — reachable only from the dev server (main.jsx mounts
 * it in DEV, scripts/admin-server.mjs answers only on loopback).
 *
 * Every edit lands in a hand-kept file — questions.json for a question,
 * term-overrides.json for a term — and the derived display.json/terms.json
 * are rebuilt on the spot. The preview under each form is the app's own card
 * on the rebuilt files, so what is shown here is what she sees.
 */
export default function Admin() {
  const [slug, setSlug] = useState(() => {
    const fromUrl = window.location.pathname.split('/')[2];
    return activeSubjects.some((s) => s.slug === fromUrl) ? fromUrl : activeSubjects[0].slug;
  });
  const [tab, setTab] = useState('questions');
  const [raw, setRaw] = useState(null);
  const [status, setStatus] = useState(null);

  // The files stay tagged with their subject rather than being cleared on a
  // switch: a save rebuilds files the app's loader globs, which makes Vite
  // hot-update this module, and Fast Refresh re-runs this effect — clearing
  // here would unmount the editor mid-edit on every save.
  const load = () =>
    api(slug).then((files) => setRaw({ slug, ...files })).catch((e) => setStatus({ ok: false, text: e.message }));
  useEffect(() => {
    window.history.replaceState(null, '', `/admin/${slug}`);
    load();
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const subject = useMemo(
    () => raw?.slug === slug ? fold(getSubjectMeta(slug), raw.pool, raw.display, raw.terms, raw.cheatsheet) : null,
    [raw, slug],
  );

  // `body` is a function so a form's own parsing (the answers JSON) fails
  // into the same status line as a refused edit.
  const save = async (path, method, body) => {
    setStatus(null);
    try {
      const { log } = await api(`${slug}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body()) : undefined,
      });
      setStatus({ ok: true, text: log });
      await load();
    } catch (e) {
      setStatus({ ok: false, text: e.message });
    }
  };

  return (
    <div className="app admin">
      <header className="topbar">
        <h1>עריכת תוכן (מקומי בלבד)</h1>
        <span className="spacer" />
        <a href="/">→ לאפליקציה</a>
      </header>

      <div className="chips">
        {activeSubjects.map((s) => (
          <button key={s.slug} type="button" className={`chip ${s.slug === slug ? 'on' : ''}`} onClick={() => setSlug(s.slug)}>
            {s.icon} {s.he}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className={`chip ${tab === 'questions' ? 'on' : ''}`} onClick={() => setTab('questions')}>שאלות</button>
        <button type="button" className={`chip ${tab === 'terms' ? 'on' : ''}`} onClick={() => setTab('terms')}>מונחים</button>
      </div>

      {status && (
        <pre className={`notice ${status.ok ? 'info' : ''}`}>{status.ok ? '✓ נשמר\n' : ''}{status.text}</pre>
      )}

      {!subject ? (
        <p className="meta">טוען…</p>
      ) : tab === 'questions' ? (
        <Questions key={slug} subject={subject} onSave={save} />
      ) : (
        <Terms key={slug} subject={subject} overrides={raw.termOverrides} onSave={save} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ questions -- */

function Questions({ subject, onSave }) {
  const [topic, setTopic] = useState(null);
  const [search, setSearch] = useState('');
  const [id, setId] = useState(null);

  const list = subject.questions.filter((q) =>
    (!topic || q.topic === topic) &&
    (!search || `${q.id} ${q.question ?? ''} ${Object.values(q.options ?? {}).join(' ')}`.includes(search)),
  );
  const question = subject.byId.get(id);

  return (
    <>
      <div className="chips">
        {subject.topics.map((t) => (
          <button key={t.name} type="button" className={`chip ${topic === t.name ? 'on' : ''}`} onClick={() => setTopic(topic === t.name ? null : t.name)}>
            {t.name} ({t.count})
          </button>
        ))}
      </div>
      <div className="admin-grid">
        <div>
          <input type="text" placeholder="חיפוש — מספר או טקסט" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="admin-list">
            {list.map((q) => (
              <button key={q.id} type="button" className={`option ${q.id === id ? 'picked' : ''}`} onClick={() => setId(q.id)}>
                <span className="key">{q.id}</span>
                <span>{q.question || q.parts?.[0]?.question}{q.issue ? ' ⚠' : ''}</span>
              </button>
            ))}
          </div>
        </div>
        {question && (
          <div>
            <QuestionForm key={question.id} subject={subject} question={question} onSave={onSave} />
            {subject.kind === 'open'
              ? <OpenQuestionCard question={question} terms={subject.termsById} reveal showNote />
              : <QuestionCard question={question} terms={subject.termsById} reveal showNote />}
          </div>
        )}
      </div>
    </>
  );
}

function QuestionForm({ subject, question, onSave }) {
  const open = subject.kind === 'open';
  const [d, setD] = useState(() => ({
    topic: question.topic,
    question: question.question ?? '',
    options: question.options,
    correct: question.correct,
    // Typed-answer specs are edited as JSON: they are the answer key, and a
    // form per answer type is not worth it for a handful of parts.
    parts: question.parts?.map((p) => ({ ...p, answers: p.answers ? JSON.stringify(p.answers) : '' })),
    note: question.note ?? '',
    issue: question.issue ?? '',
  }));
  const set = (k, v) => setD({ ...d, [k]: v });
  const setPart = (i, k, v) => set('parts', d.parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const body = () => ({
    topic: d.topic,
    question: d.question,
    note: d.note,
    issue: d.issue,
    ...(open
      ? {
          parts: d.parts.map(({ key, question: q, solution, answers }) => ({
            ...(key ? { key } : {}),
            question: q,
            solution,
            ...(answers.trim() ? { answers: JSON.parse(answers) } : {}),
          })),
        }
      : { options: d.options, correct: d.correct }),
  });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(`question/${question.id}`, 'PUT', body);
      }}
    >
      <label>נושא</label>
      <input type="text" list="admin-topics" value={d.topic} onChange={(e) => set('topic', e.target.value)} />
      <datalist id="admin-topics">
        {subject.topics.map((t) => <option key={t.name} value={t.name} />)}
      </datalist>

      <label>שאלה</label>
      <textarea rows={3} value={d.question} onChange={(e) => set('question', e.target.value)} />

      {open ? d.parts.map((p, i) => (
        <fieldset key={i}>
          <legend>סעיף {p.key ?? i + 1}</legend>
          <label>שאלה</label>
          <textarea rows={2} value={p.question} onChange={(e) => setPart(i, 'question', e.target.value)} />
          <label>פתרון רשמי</label>
          <textarea rows={2} value={p.solution} onChange={(e) => setPart(i, 'solution', e.target.value)} />
          <label>answers (JSON, ריק = דירוג עצמי)</label>
          <textarea rows={2} dir="ltr" value={p.answers} onChange={(e) => setPart(i, 'answers', e.target.value)} />
        </fieldset>
      )) : (
        <>
          <label>תשובות — הרדיו מסמן את הנכונה</label>
          {OPTION_KEYS.map((k) => (
            <div key={k} className="row" style={{ marginBottom: 6 }}>
              <input type="radio" name="correct" checked={d.correct === k} onChange={() => set('correct', k)} />
              <b>{k}</b>
              <input type="text" style={{ flex: 1, width: 'auto' }} value={d.options[k]} onChange={(e) => set('options', { ...d.options, [k]: e.target.value })} />
            </div>
          ))}
        </>
      )}

      <label>הערה (מוצגת בתרגול בלבד)</label>
      <input type="text" value={d.note} onChange={(e) => set('note', e.target.value)} />
      <label>פגם במקור (מוציא את השאלה מהסימולציה)</label>
      <input type="text" value={d.issue} onChange={(e) => set('issue', e.target.value)} />

      <div className="row end" style={{ marginTop: 12 }}>
        <button type="submit" className="btn">שמירה</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- terms -- */

function Terms({ subject, overrides, onSave }) {
  const [search, setSearch] = useState('');
  const [id, setId] = useState(null);

  const list = subject.terms.filter((t) => !search || `${t.he} ${t.en} ${t.definition}`.includes(search));
  const term = id === 'new' ? null : subject.termsById.get(id);
  const uses = (tid) => subject.questions.filter((q) => q.terms.includes(tid)).length;
  // Aliases live only in the overrides (terms.json has the expanded match list).
  const hand = (overrides.add ?? []).find((t) => t.id === id) ?? overrides.patch?.[id] ?? {};

  return (
    <div className="admin-grid">
      <div>
        <div className="row">
          <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="חיפוש" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="chip" onClick={() => setId('new')}>+ מונח</button>
        </div>
        <div className="admin-list">
          {list.map((t) => (
            <button key={t.id} type="button" className={`option ${t.id === id ? 'picked' : ''}`} onClick={() => setId(t.id)}>
              <span className="key">{uses(t.id)}</span>
              <span><b>{t.he}</b> · {t.en}<br /><span className="meta">{t.definition}</span></span>
            </button>
          ))}
        </div>
      </div>
      {id && (
        <TermForm
          key={id}
          subject={subject}
          term={term}
          aliases={hand.aliases ?? []}
          onSave={onSave}
          onDrop={() => onSave(`term/${id}`, 'DELETE').then(() => setId(null))}
        />
      )}
    </div>
  );
}

function TermForm({ subject, term, aliases, onSave, onDrop }) {
  const [d, setD] = useState({
    id: term?.id ?? '',
    he: term?.he ?? '',
    en: term?.en ?? '',
    definition: term?.definition ?? '',
    aliases: aliases.join(', '),
    topic: term?.topic?.he ?? subject.termTopics[0]?.he ?? '',
  });
  const set = (k, v) => setD({ ...d, [k]: v });

  // Only what changed goes into the override, so the file stays a record of
  // hand decisions rather than a copy of the cheatsheet.
  const body = () => {
    const next = { he: d.he, en: d.en, definition: d.definition, aliases: d.aliases.split(',').map((s) => s.trim()).filter(Boolean) };
    if (!term) return { ...next, topic: subject.termTopics.find((t) => t.he === d.topic) };
    return Object.fromEntries(
      Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(k === 'aliases' ? aliases : term[k])),
    );
  };

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(`term/${d.id}`, 'PUT', body);
      }}
    >
      <label>מזהה (id, לטינית)</label>
      <input type="text" dir="ltr" value={d.id} readOnly={Boolean(term)} required onChange={(e) => set('id', e.target.value)} />
      <label>עברית</label>
      <input type="text" value={d.he} required onChange={(e) => set('he', e.target.value)} />
      <label>English</label>
      <input type="text" dir="ltr" value={d.en} onChange={(e) => set('en', e.target.value)} />
      <label>הגדרה (בלי המונח עצמו)</label>
      <textarea rows={3} value={d.definition} required onChange={(e) => set('definition', e.target.value)} />
      <label>צורות נוספות במאגר (מופרדות בפסיק)</label>
      <input type="text" value={d.aliases} onChange={(e) => set('aliases', e.target.value)} />
      {term ? (
        <p className="meta">מזוהה בטקסט כ: {term.match.join(' · ')} — סעיף: {term.topic.he}</p>
      ) : (
        <>
          <label>סעיף בצ'יט שיט</label>
          <select value={d.topic} onChange={(e) => set('topic', e.target.value)}>
            {subject.termTopics.map((t) => <option key={t.he} value={t.he}>{t.he}</option>)}
          </select>
        </>
      )}
      <div className="row end" style={{ marginTop: 12 }}>
        {term && (
          <button type="button" className="chip danger" onClick={onDrop}>
            הסרת המונח
          </button>
        )}
        <button type="submit" className="btn">שמירה</button>
      </div>
    </form>
  );
}
