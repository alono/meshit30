import { useEffect, useMemo, useState } from 'react';
import QuestionCard from '../components/QuestionCard.jsx';
import {
  clearPracticePos,
  loadPracticePos,
  loadWrongQueue,
  recordAnswer,
  savePracticePos,
} from '../lib/progress.js';
import { newSeed, rng, shuffle } from '../lib/rng.js';
import { cheatsheetSnippet } from '../lib/snippet.js';

// The list is fixed for the length of a filter selection: re-reading the
// wrong queue here (instead of depending on the `wrongQueue` state) means
// answering a question can't shrink/reshuffle the array she is mid-question
// on, which used to shift the current index onto a different question
// while its reveal state was still showing — marking the wrong one — or,
// when the shrink landed on an empty array, crash the screen outright.
const buildQuestions = (subject, topic, onlyWrong, seed) => {
  const wrong = new Set(loadWrongQueue(subject.slug));
  const filtered = subject.questions.filter(
    (q) => (!topic || q.topic === topic) && (!onlyWrong || wrong.has(q.id)),
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
  // A saved position is only offered if it still lands somewhere — a stale
  // save (its topic no longer has any questions, or the wrong queue it
  // filtered on has since been cleared elsewhere) collapses to an empty list
  // and is silently treated as nothing to resume.
  const resumable = useMemo(() => {
    const saved = loadPracticePos(subject.slug);
    if (!saved) return null;
    const total = buildQuestions(subject, saved.topic, saved.onlyWrong, saved.seed).length;
    return total ? { ...saved, total } : null;
  }, [subject]);

  const [pending, setPending] = useState(Boolean(resumable));
  const [topic, setTopic] = useState(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [picked, setPicked] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [wrongQueue, setWrongQueue] = useState(() => loadWrongQueue(subject.slug));
  // One shuffle per filter selection. The seed only changes on reset(), so
  // answering (which updates wrongQueue) re-filters without re-ordering.
  const [seed, setSeed] = useState(newSeed);

  const questions = useMemo(
    () => buildQuestions(subject, topic, onlyWrong, seed),
    [subject, topic, onlyWrong, seed],
  );

  // Remember where she is, so leaving (or a reload) can offer to pick up here
  // instead of losing the spot. Held off while the resume choice is still
  // pending so it can't overwrite the very save it's about to offer.
  useEffect(() => {
    if (pending) return;
    savePracticePos(subject.slug, { topic, onlyWrong, seed, cursor });
  }, [subject.slug, topic, onlyWrong, seed, cursor, pending]);

  const question = questions[cursor % Math.max(questions.length, 1)];

  const choose = (key) => {
    if (picked || !question) return;
    setPicked(key);
    recordAnswer(subject.slug, question.id, key === question.correct);
    setWrongQueue(loadWrongQueue(subject.slug));
  };

  const next = () => {
    setPicked(null);
    setCursor((c) => c + 1);
  };

  const reset = (fn) => {
    fn();
    setPicked(null);
    setCursor(0);
    setSeed(newSeed());
  };

  const resume = () => {
    setTopic(resumable.topic);
    setOnlyWrong(resumable.onlyWrong);
    setSeed(resumable.seed);
    setCursor(resumable.cursor);
    setPending(false);
  };

  const startOver = () => {
    clearPracticePos(subject.slug);
    setPending(false);
  };

  if (pending) {
    const parts = [resumable.topic, resumable.onlyWrong ? 'שאלות שטעית בהן' : null].filter(Boolean);
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
          className={`chip ${!topic && !onlyWrong ? 'on' : ''}`}
          onClick={() => reset(() => { setTopic(null); setOnlyWrong(false); })}
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
          {onlyWrong ? 'אין כרגע שאלות שטעית בהן — כל הכבוד!' : 'אין שאלות בנושא הזה.'}
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
