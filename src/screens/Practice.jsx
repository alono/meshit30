import { useEffect, useMemo, useState } from 'react';
import QuestionCard from '../components/QuestionCard.jsx';
import {
  clearPracticePos,
  loadBookmarks,
  loadPracticePos,
  loadWrongQueue,
  recordAnswer,
  savePracticePos,
  toggleBookmark,
} from '../lib/progress.js';
import { newSeed, rng, shuffle } from '../lib/rng.js';
import { cheatsheetSnippet } from '../lib/snippet.js';

// The list is fixed for the length of a filter selection: re-reading the
// wrong queue here (instead of depending on the `wrongQueue` state) means
// answering a question can't shrink/reshuffle the array she is mid-question
// on, which used to shift the current index onto a different question
// while its reveal state was still showing — marking the wrong one — or,
// when the shrink landed on an empty array, crash the screen outright.
const buildQuestions = (subject, topic, onlyWrong, onlyMarked, seed) => {
  const wrong = new Set(loadWrongQueue(subject.slug));
  const marked = new Set(loadBookmarks(subject.slug));
  const filtered = subject.questions.filter(
    (q) =>
      (!topic || q.topic === topic) &&
      (!onlyWrong || wrong.has(q.id)) &&
      (!onlyMarked || marked.has(q.id)),
  );
  return shuffle(filtered, rng(seed));
};

/**
 * תרגול — questions by topic with immediate feedback.
 *
 * A wrong answer shows the correct option plus the matching lines from the
 * cheat sheet, and puts the question into the review queue until she gets it
 * right. Questions the source PDF damaged stay available here (with their
 * warning) because they are still worth reading — they are only excluded from
 * the simulated exam.
 */
export default function Practice({ subject }) {
  // A saved position carries the exact question order it was walking, so
  // resuming lands on the same question even after the wrong queue shrank or
  // a content update moved things — questions that no longer exist are
  // dropped, and a save that collapses to nothing is silently ignored.
  const resumable = useMemo(() => {
    const saved = loadPracticePos(subject.slug);
    if (!saved) return null;
    // Older saves kept only the seed; rebuild their order the way they did.
    const ids = (saved.ids ?? buildQuestions(subject, saved.topic, saved.onlyWrong, saved.onlyMarked, saved.seed).map((q) => q.id))
      .filter((id) => subject.byId.has(id));
    return ids.length ? { ...saved, ids, total: ids.length } : null;
  }, [subject]);

  const [pending, setPending] = useState(Boolean(resumable));
  const [topic, setTopic] = useState(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [onlyMarked, setOnlyMarked] = useState(false);
  // Her pick per position, so stepping back shows the question as she left
  // it (already revealed) instead of letting it be answered twice.
  const [picks, setPicks] = useState({});
  const [cursor, setCursor] = useState(0);
  const [wrongQueue, setWrongQueue] = useState(() => loadWrongQueue(subject.slug));
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks(subject.slug));
  // One shuffle per filter selection. The seed only changes on reset(), so
  // answering (which updates wrongQueue) re-filters without re-ordering.
  const [seed, setSeed] = useState(newSeed);
  // A resumed run keeps the list it was saved with; reset() drops it.
  const [order, setOrder] = useState(null);

  const questions = useMemo(
    () => (order
      ? order.map((id) => subject.byId.get(id))
      : buildQuestions(subject, topic, onlyWrong, onlyMarked, seed)),
    [subject, topic, onlyWrong, onlyMarked, seed, order],
  );

  // Remember where she is, so leaving (or a reload) can offer to pick up here
  // instead of losing the spot. Held off while the resume choice is still
  // pending so it can't overwrite the very save it's about to offer.
  useEffect(() => {
    if (pending) return;
    savePracticePos(subject.slug, { topic, onlyWrong, onlyMarked, cursor, picks, ids: questions.map((q) => q.id) });
  }, [subject.slug, topic, onlyWrong, onlyMarked, cursor, picks, questions, pending]);

  const question = questions[cursor % Math.max(questions.length, 1)];
  const picked = picks[cursor] ?? null;

  const choose = (key) => {
    if (picked || !question) return;
    setPicks((p) => ({ ...p, [cursor]: key }));
    recordAnswer(subject.slug, question.id, key === question.correct);
    setWrongQueue(loadWrongQueue(subject.slug));
  };

  const next = () => setCursor((c) => c + 1);
  const prev = () => setCursor((c) => c - 1);

  const reset = (fn) => {
    fn();
    setPicks({});
    setCursor(0);
    setSeed(newSeed());
    setOrder(null);
  };

  const resume = () => {
    setTopic(resumable.topic);
    setOnlyWrong(resumable.onlyWrong);
    setOnlyMarked(Boolean(resumable.onlyMarked));
    setOrder(resumable.ids);
    setPicks(resumable.picks ?? {});
    setCursor(resumable.cursor);
    setPending(false);
  };

  const startOver = () => {
    clearPracticePos(subject.slug);
    setPending(false);
  };

  if (pending) {
    const parts = [
      resumable.topic,
      resumable.onlyWrong ? 'שאלות שטעית בהן' : null,
      resumable.onlyMarked ? 'שאלות שסימנת' : null,
    ].filter(Boolean);
    const label = parts.length ? parts.join(' · ') : 'כל השאלות';
    return (
      <div className="card">
        <p>יש לך תרגול פתוח — {label}, שאלה {(resumable.cursor % resumable.total) + 1} מתוך {resumable.total}.</p>
        <div className="row">
          <button type="button" className="btn" onClick={resume}>המשך מאיפה שהפסקתי</button>
          <button type="button" className="btn ghost" onClick={startOver}>התחלה מחדש</button>
        </div>
      </div>
    );
  }

  const snippet = picked && question && picked !== question.correct
    ? cheatsheetSnippet(subject, question)
    : null;

  return (
    <>
      <div className="chips">
        <button
          type="button"
          className={`chip ${!topic && !onlyWrong && !onlyMarked ? 'on' : ''}`}
          onClick={() => reset(() => { setTopic(null); setOnlyWrong(false); setOnlyMarked(false); })}
        >
          כל השאלות
        </button>
        <button
          type="button"
          className={`chip ${onlyWrong ? 'on' : ''}`}
          onClick={() => reset(() => setOnlyWrong((v) => !v))}
        >
          שאלות שטעית בהן ({wrongQueue.length})
        </button>
        <button
          type="button"
          className={`chip ${onlyMarked ? 'on' : ''}`}
          onClick={() => reset(() => setOnlyMarked((v) => !v))}
        >
          ★ שאלות שסימנת ({bookmarks.length})
        </button>
      </div>

      <div className="chips">
        {subject.topics.map((t) => (
          <button
            key={t.name}
            type="button"
            className={`chip ${topic === t.name ? 'on' : ''}`}
            onClick={() => reset(() => setTopic(topic === t.name ? null : t.name))}
          >
            {t.name} ({t.count})
          </button>
        ))}
      </div>

      {!questions.length ? (
        <p className="notice info">
          {onlyWrong
            ? 'אין כרגע שאלות שטעית בהן — כל הכבוד!'
            : onlyMarked
              ? 'עדיין לא סימנת שאלות — הכוכב מתחת לשאלה מסמן אותה.'
              : 'אין שאלות בנושא הזה.'}
        </p>
      ) : (
        <>
          <QuestionCard
            question={question}
            terms={subject.termsById}
            picked={picked}
            reveal={Boolean(picked)}
            onPick={choose}
            showNote
            index={cursor % questions.length}
            total={questions.length}
          >
            {snippet && (
              <div className="notice info" style={{ marginTop: 12 }}>
                <b>מהצ'יט שיט:</b>
                {snippet.map((line, i) => <p key={i} style={{ margin: '6px 0 0' }}>{line}</p>)}
              </div>
            )}
          </QuestionCard>

          <div className="row end">
            <button type="button" className="chip" disabled={!cursor} onClick={prev}>
              → השאלה הקודמת
            </button>
            <button
              type="button"
              className={`chip ${bookmarks.includes(question.id) ? 'on' : ''}`}
              onClick={() => setBookmarks(toggleBookmark(subject.slug, question.id))}
            >
              {bookmarks.includes(question.id) ? '★ מסומנת' : '☆ סימון'}
            </button>
            <button type="button" className="btn" onClick={next} disabled={!picked}>
              השאלה הבאה
            </button>
          </div>
          <p className="meta">אפשר לענות גם במקלדת: 1–4 או א–ד.</p>
        </>
      )}
    </>
  );
}
