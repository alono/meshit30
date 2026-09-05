import { useEffect, useMemo, useState } from 'react';
import OpenQuestionCard, { autoVerdict } from '../components/OpenQuestionCard.jsx';
import DeviationTable from '../components/DeviationTable.jsx';
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
// grading an exercise in next() can't shrink/reshuffle the array out from
// under the cursor she is about to advance onto. See Practice.jsx for the
// same fix and the bug it closes.
const buildQuestions = (subject, topic, onlyWrong, seed) => {
  const wrong = new Set(loadWrongQueue(subject.slug));
  const filtered = subject.questions.filter(
    (q) => (!topic || q.topic === topic) && (!onlyWrong || wrong.has(q.id)),
  );
  return shuffle(filtered, rng(seed));
};

/**
 * תרגול for an open (chart-work) subject.
 *
 * The rhythm differs from multiple choice: read the exercise, solve it on the
 * physical chart (typing numeric results where the exercise has them), reveal
 * the official solution, then grade every part before moving on. An exercise
 * joins the review queue unless all of its parts were right.
 */
export default function OpenPractice({ subject }) {
  // See Practice.jsx: a saved position is only offered if it still lands
  // somewhere, otherwise it's stale and silently treated as nothing to resume.
  const resumable = useMemo(() => {
    const saved = loadPracticePos(subject.slug);
    if (!saved) return null;
    const total = buildQuestions(subject, saved.topic, saved.onlyWrong, saved.seed).length;
    return total ? { ...saved, total } : null;
  }, [subject]);

  const [pending, setPending] = useState(Boolean(resumable));
  const [topic, setTopic] = useState(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [inputs, setInputs] = useState({});
  const [verdicts, setVerdicts] = useState([]);
  const [wrongQueue, setWrongQueue] = useState(() => loadWrongQueue(subject.slug));
  // One shuffle per filter selection, exactly like the MC practice screen.
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

  const reveal = () => {
    if (!question) return;
    setRevealed(true);
    setVerdicts(question.parts.map((part, i) => autoVerdict(part, inputs[i])));
  };

  const graded = revealed && question && question.parts.every((_, i) => typeof verdicts[i] === 'boolean');

  const next = () => {
    recordAnswer(subject.slug, question.id, verdicts.every((v) => v === true));
    setWrongQueue(loadWrongQueue(subject.slug));
    setRevealed(false);
    setInputs({});
    setVerdicts([]);
    setCursor((c) => c + 1);
  };

  const reset = (fn) => {
    fn();
    setRevealed(false);
    setInputs({});
    setVerdicts([]);
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

  const snippet = graded && verdicts.some((v) => v === false)
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

      <p className="meta">
        פותרים על מפה 1000 ישראל האמיתית; מקלידים תוצאות מספריות היכן שיש שדות, וחושפים את
        הפתרון הרשמי להשוואה.
      </p>
      <DeviationTable table={subject.deviationTable} />

      {!questions.length ? (
        <p className="notice info">
          {onlyWrong ? 'אין כרגע שאלות שטעית בהן — כל הכבוד!' : 'אין שאלות בנושא הזה.'}
        </p>
      ) : (
        <>
          <OpenQuestionCard
            question={question}
            terms={subject.termsById}
            reveal={revealed}
            inputs={inputs}
            onInput={(i, value) => setInputs((prev) => ({ ...prev, [i]: value }))}
            verdicts={verdicts}
            onVerdict={(i, right) => setVerdicts((prev) => {
              const nextV = [...prev];
              nextV[i] = right;
              return nextV;
            })}
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
          </OpenQuestionCard>

          <div className="row end">
            {!revealed ? (
              <button type="button" className="btn" onClick={reveal}>הצגת הפתרון</button>
            ) : (
              <button type="button" className="btn" onClick={next} disabled={!graded}>
                השאלה הבאה
              </button>
            )}
          </div>
          {revealed && !graded && (
            <p className="meta">יש לסמן נכון/לא נכון על כל סעיף כדי להמשיך.</p>
          )}
        </>
      )}
    </>
  );
}
