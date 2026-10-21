import { useEffect, useMemo, useRef, useState } from 'react';
import QuestionCard from '../components/QuestionCard.jsx';
import { buildAttempt, scoreAttempt } from '../lib/exam.js';
import { newSeed } from '../lib/rng.js';
import { recordAttempt } from '../lib/progress.js';
import { strings } from '../lib/i18n.js';

const two = (n) => String(n).padStart(2, '0');
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};

/** סימולציה — a full timed paper, no feedback until it is handed in. */
export default function Exam({ subject, onFinish }) {
  const t = strings(subject.lang);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [cursor, setCursor] = useState(0);
  const [remaining, setRemaining] = useState(subject.exam.minutes * 60_000);
  const submitted = useRef(false);

  const start = () => {
    setAttempt(buildAttempt(subject, newSeed()));
    setAnswers({});
    setCursor(0);
    setRemaining(subject.exam.minutes * 60_000);
    submitted.current = false;
  };

  const submit = useMemo(
    () => (current) => {
      if (submitted.current || !attempt) return;
      submitted.current = true;
      const result = scoreAttempt(subject, attempt, current);
      recordAttempt(subject.slug, attempt, result);
      onFinish({ attempt, result });
    },
    [attempt, subject, onFinish],
  );

  // Countdown; hands the paper in automatically when it runs out.
  useEffect(() => {
    if (!attempt) return undefined;
    const deadline = attempt.startedAt + subject.exam.minutes * 60_000;
    const tick = setInterval(() => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        setAnswers((current) => { submit(current); return current; });
      }
    }, 500);
    return () => clearInterval(tick);
  }, [attempt, subject.exam.minutes, submit]);

  if (!attempt) {
    const excluded = subject.questions.filter((q) => q.issue).length;
    return (
      <div className="card">
        <b>{t.examTitle}</b>
        <p>{t.examLine(subject.exam.questions, subject.exam.minutes, subject.exam.points_per_question, subject.exam.pass)}</p>
        <p className="meta">
          {t.examRules}
          {excluded > 0 && t.examExcluded(excluded)}
        </p>
        {subject.exam.critical && <p className="notice">⚠ {subject.exam.critical.note}</p>}
        <button type="button" className="btn" onClick={start}>{t.start}</button>
      </div>
    );
  }

  const id = attempt.questionIds[cursor];
  const question = subject.byId.get(id);
  const answered = Object.keys(answers).length;
  const last = cursor === attempt.questionIds.length - 1;

  return (
    <>
      <div className="card">
        <div className="row">
          <span className={`timer ${remaining < 5 * 60_000 ? 'low' : ''}`}>
            ⏱ {clock(remaining)}
          </span>
          <span style={{ flex: 1 }} />
          <span className="meta">{t.answered(answered, attempt.questionIds.length)}</span>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${(answered / attempt.questionIds.length) * 100}%` }} />
        </div>
      </div>

      <QuestionCard
        question={question}
        lang={subject.lang}
        order={attempt.optionOrder[id]}
        terms={subject.termsById}
        picked={answers[id] ?? null}
        onPick={(key) => setAnswers((a) => ({ ...a, [id]: key }))}
        index={cursor}
        total={attempt.questionIds.length}
      />

      <div className="row">
        <button
          type="button"
          className="btn ghost"
          disabled={cursor === 0}
          onClick={() => setCursor((c) => c - 1)}
        >
          {t.prev}
        </button>
        <span style={{ flex: 1 }} />
        {last ? (
          <button type="button" className="btn" onClick={() => submit(answers)}>{t.submit}</button>
        ) : (
          <button type="button" className="btn" onClick={() => setCursor((c) => c + 1)}>{t.next}</button>
        )}
      </div>

      {last && answered < attempt.questionIds.length && (
        <p className="notice" style={{ marginTop: 12 }}>
          {t.unanswered(attempt.questionIds.length - answered)}
        </p>
      )}
    </>
  );
}
