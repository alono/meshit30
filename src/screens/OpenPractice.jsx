import { useMemo, useState } from 'react';
import OpenQuestionCard, { autoVerdict } from '../components/OpenQuestionCard.jsx';
import DeviationTable from '../components/DeviationTable.jsx';
import { loadWrongQueue, recordAnswer } from '../lib/progress.js';
import { newSeed, rng, shuffle } from '../lib/rng.js';
import { cheatsheetSnippet } from '../lib/snippet.js';

/**
 * תרגול for an open (chart-work) subject.
 *
 * The rhythm differs from multiple choice: read the exercise, solve it on the
 * physical chart (typing numeric results where the exercise has them), reveal
 * the official solution, then grade every part before moving on. An exercise
 * joins the review queue unless all of its parts were right.
 */
export default function OpenPractice({ subject }) {
  const [topic, setTopic] = useState(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [inputs, setInputs] = useState({});
  const [verdicts, setVerdicts] = useState([]);
  const [wrongQueue, setWrongQueue] = useState(() => loadWrongQueue(subject.slug));
  // One shuffle per filter selection, exactly like the MC practice screen.
  const [seed, setSeed] = useState(newSeed);

  const questions = useMemo(() => {
    const wrong = new Set(wrongQueue);
    const filtered = subject.questions.filter(
      (q) => (!topic || q.topic === topic) && (!onlyWrong || wrong.has(q.id)),
    );
    return shuffle(filtered, rng(seed));
  }, [subject.questions, topic, onlyWrong, wrongQueue, seed]);

  const question = questions[cursor % Math.max(questions.length, 1)];

  const reveal = () => {
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
