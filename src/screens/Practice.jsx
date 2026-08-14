import { useMemo, useState } from 'react';
import QuestionCard from '../components/QuestionCard.jsx';
import { loadWrongQueue, recordAnswer } from '../lib/progress.js';
import { newSeed, rng, shuffle } from '../lib/rng.js';
import { cheatsheetSnippet } from '../lib/snippet.js';

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
  const [topic, setTopic] = useState(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [picked, setPicked] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [wrongQueue, setWrongQueue] = useState(() => loadWrongQueue(subject.slug));
  // One shuffle per filter selection. The seed only changes on reset(), so
  // answering (which updates wrongQueue) re-filters without re-ordering.
  const [seed, setSeed] = useState(newSeed);

  const questions = useMemo(() => {
    const wrong = new Set(wrongQueue);
    const filtered = subject.questions.filter(
      (q) => (!topic || q.topic === topic) && (!onlyWrong || wrong.has(q.id)),
    );
    return shuffle(filtered, rng(seed));
  }, [subject.questions, topic, onlyWrong, wrongQueue, seed]);

  const question = questions[cursor % Math.max(questions.length, 1)];

  const choose = (key) => {
    if (picked) return;
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

  const snippet = picked && picked !== question.correct
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
