import { useEffect, useState } from 'react';
import OpenQuestionCard, { autoVerdict } from '../components/OpenQuestionCard.jsx';
import DeviationTable from '../components/DeviationTable.jsx';
import { buildAttempt } from '../lib/exam.js';
import { scoreOpenAttempt } from '../lib/open.js';
import { newSeed } from '../lib/rng.js';
import { recordAttempt } from '../lib/progress.js';

const two = (n) => String(n).padStart(2, '0');
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};

/**
 * סימולציה for an open (chart-work) subject, in three acts: the timed paper
 * (solve on the physical chart, no feedback), then an untimed score sheet
 * where every part is graded against the official solution, then the results.
 * The clock only pressures the solving — grading honestly takes as long as it
 * takes.
 */
export default function OpenExam({ subject, onFinish }) {
  const [attempt, setAttempt] = useState(null);
  const [grading, setGrading] = useState(false);
  const [inputs, setInputs] = useState({});
  const [verdicts, setVerdicts] = useState({});
  const [cursor, setCursor] = useState(0);
  const [remaining, setRemaining] = useState(subject.exam.minutes * 60_000);

  const start = () => {
    setAttempt(buildAttempt(subject, newSeed()));
    setGrading(false);
    setInputs({});
    setVerdicts({});
    setCursor(0);
    setRemaining(subject.exam.minutes * 60_000);
  };

  const handIn = () => {
    // Typed entries pre-grade their parts; the learner confirms or overrides
    // each verdict on the sheet.
    setVerdicts(Object.fromEntries(
      attempt.questionIds.map((id) => {
        const q = subject.byId.get(id);
        return [id, q.parts.map((part, i) => autoVerdict(part, inputs[id]?.[i]))];
      }),
    ));
    setGrading(true);
  };

  // Countdown; opens the score sheet when it runs out — grading is manual, so
  // there is nothing to hand in automatically beyond what was typed.
  useEffect(() => {
    if (!attempt || grading) return undefined;
    const deadline = attempt.startedAt + subject.exam.minutes * 60_000;
    const tick = setInterval(() => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) clearInterval(tick);
    }, 500);
    return () => clearInterval(tick);
  }, [attempt, grading, subject.exam.minutes]);

  // The deadline passing flips the phase in render-safe state, not inside the
  // interval callback, so handIn always sees the latest typed inputs.
  useEffect(() => {
    if (attempt && !grading && remaining <= 0) handIn();
  });

  if (!attempt) {
    return (
      <>
        <div className="card">
          <b>סימולציית מבחן</b>
          <p>
            {subject.exam.questions} תרגילים · {subject.exam.minutes} דקות · ציון עובר {subject.exam.pass}
          </p>
          {subject.prelude?.length > 0 && (
            <ul>
              {subject.prelude.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          <p className="meta">
            נדרשת {subject.chart ?? 'מפה'} אמיתית וכלי שרטוט. התרגילים נבחרים באקראי לפי התפלגות
            הנושאים במאגר. אין משוב עד להגשה; לאחר ההגשה נפתח דף בדיקה שבו מדרגים כל סעיף מול
            הפתרון הרשמי — הציון נקבע לפי הסעיפים.
          </p>
          <button type="button" className="btn" onClick={start}>להתחיל</button>
        </div>
        <DeviationTable table={subject.deviationTable} />
      </>
    );
  }

  if (grading) {
    const total = attempt.questionIds.reduce((n, id) => n + subject.byId.get(id).parts.length, 0);
    const graded = attempt.questionIds.reduce(
      (n, id) => n + (verdicts[id] ?? []).filter((v) => typeof v === 'boolean').length,
      0,
    );
    const done = graded === total;

    const finish = () => {
      const result = scoreOpenAttempt(subject, attempt, verdicts);
      recordAttempt(subject.slug, attempt, result);
      onFinish({ attempt, result });
    };

    return (
      <>
        <div className="card">
          <b>דף הבדיקה</b>
          <p className="meta">
            השוו כל סעיף לפתרון הרשמי וסמנו נכון/לא נכון. סעיפים שהוקלדו נבדקו אוטומטית —
            אפשר לתקן את הסימון ידנית.
          </p>
          <div className="bar" style={{ marginTop: 10 }}>
            <i style={{ width: `${(graded / total) * 100}%` }} />
          </div>
          <p className="meta">דורגו {graded} מתוך {total} סעיפים</p>
        </div>

        <DeviationTable table={subject.deviationTable} />

        {attempt.questionIds.map((id, i) => (
          <OpenQuestionCard
            key={id}
            question={subject.byId.get(id)}
            terms={subject.termsById}
            reveal
            inputs={inputs[id] ?? {}}
            verdicts={verdicts[id] ?? []}
            onVerdict={(partIndex, right) => setVerdicts((prev) => {
              const forQ = [...(prev[id] ?? [])];
              forQ[partIndex] = right;
              return { ...prev, [id]: forQ };
            })}
            showNote
            index={i}
            total={attempt.questionIds.length}
          />
        ))}

        <div className="row end">
          <button type="button" className="btn" onClick={finish} disabled={!done}>
            סיום וחישוב ציון
          </button>
        </div>
        {!done && <p className="meta">יש לדרג את כל הסעיפים כדי לחשב ציון.</p>}
      </>
    );
  }

  const id = attempt.questionIds[cursor];
  const question = subject.byId.get(id);
  const touched = attempt.questionIds.filter((qid) => inputs[qid] !== undefined).length;
  const last = cursor === attempt.questionIds.length - 1;

  return (
    <>
      <div className="card">
        <div className="row">
          <span className={`timer ${remaining < 5 * 60_000 ? 'low' : ''}`}>
            ⏱ {clock(remaining)}
          </span>
          <span style={{ flex: 1 }} />
          <span className="meta">תרגיל {cursor + 1} מתוך {attempt.questionIds.length}</span>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${(touched / attempt.questionIds.length) * 100}%` }} />
        </div>
      </div>

      <DeviationTable table={subject.deviationTable} />

      <OpenQuestionCard
        question={question}
        terms={subject.termsById}
        inputs={inputs[id] ?? {}}
        onInput={(partIndex, value) => setInputs((prev) => ({
          ...prev,
          [id]: { ...(prev[id] ?? {}), [partIndex]: value },
        }))}
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
          הקודם
        </button>
        <span style={{ flex: 1 }} />
        {last ? (
          <button type="button" className="btn" onClick={handIn}>הגשה</button>
        ) : (
          <button type="button" className="btn" onClick={() => setCursor((c) => c + 1)}>הבא</button>
        )}
      </div>
    </>
  );
}
