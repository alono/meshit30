import TermText from './TermText.jsx';
import { ANSWER_TYPES, checkAnswer } from '../lib/open.js';

// What to show inside an empty typed-answer field, per answer type.
const PLACEHOLDERS = {
  course: '000°',
  variation: "4°20'W",
  speed: '0.0',
  distance: '0.0',
  depth: '0.0',
  height: '0.0',
  time: 'HH:MM',
  minutes: '0',
  position: null, // rendered as two fields with their own placeholders
  scale: '1:30000',
  number: '0',
};

/**
 * What the typed entries say about one part, for pre-filling its verdict on
 * reveal: false the moment any entry misses, true when every entry hits, and
 * undefined — grade by hand — while anything is empty or unreadable.
 */
export function autoVerdict(part, input) {
  if (!part.answers) return undefined;
  const checks = part.answers.map((spec, j) => checkAnswer(spec, (input ?? [])[j]));
  if (checks.some((c) => c === false)) return false;
  return checks.every((c) => c === true) ? true : undefined;
}

/**
 * One chart-work exercise: a scenario stem and its lettered parts.
 *
 * The learner solves on the physical chart. Parts with typed answers take
 * keyboard input and are auto-checked on reveal; every part is finally graded
 * by the learner herself against the official solution — chart-work tolerance
 * calls belong to a person, so the auto-check only pre-fills the verdict.
 */
export default function OpenQuestionCard({
  question,
  terms,
  reveal = false,
  inputs = {},
  onInput,
  verdicts = [],
  onVerdict,
  showNote = false,
  index,
  total,
  children,
}) {
  const termRecords = (question.terms ?? []).map((id) => terms.get(id)).filter(Boolean);

  return (
    <section className="card">
      {index != null && (
        <p className="meta">
          שאלה {index + 1} מתוך {total} · {question.topic}
        </p>
      )}

      {question.question && (
        <p className="qtext">
          <TermText text={question.question} terms={termRecords} />
        </p>
      )}

      {question.issue && <p className="notice">⚠ {question.issue}</p>}

      {question.parts.map((part, i) => (
        <Part
          key={part.key ?? i}
          part={part}
          termRecords={termRecords}
          reveal={reveal}
          input={inputs[i]}
          onInput={onInput && ((value) => onInput(i, value))}
          verdict={verdicts[i]}
          onVerdict={onVerdict && ((right) => onVerdict(i, right))}
          reconstructed={question.reconstructed}
          partRef={part.key ?? String(i + 1)}
        />
      ))}

      {reveal && showNote && question.note && <p className="notice">הערה: {question.note}</p>}
      {children}
    </section>
  );
}

function Part({ part, termRecords, reveal, input, onInput, verdict, onVerdict, reconstructed, partRef }) {
  return (
    <div className="part">
      <p style={{ margin: 0 }}>
        {part.key && <span className="partkey">{part.key}</span>}
        <TermText text={part.question} terms={termRecords} />
        {reconstructed?.includes(`${partRef}.question`) && <span className="meta"> · נוסח משוחזר</span>}
      </p>

      {part.answers && (
        <div className="row" style={{ marginTop: 10 }}>
          {part.answers.map((spec, j) => (
            <AnswerField
              key={j}
              spec={spec}
              value={(input ?? [])[j]}
              onChange={onInput && ((v) => {
                const next = [...(input ?? [])];
                next[j] = v;
                onInput(next);
              })}
              reveal={reveal}
            />
          ))}
        </div>
      )}

      {reveal && (
        <div className="solution">
          <b>הפתרון הרשמי</b>
          <TermText text={part.solution} terms={termRecords} />
          {reconstructed?.includes(`${partRef}.solution`) && <span className="meta"> · נוסח משוחזר</span>}
        </div>
      )}

      {reveal && onVerdict && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="meta">איך הלך לך בסעיף הזה?</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className={`chip ${verdict === true ? 'grade-right' : ''}`}
            onClick={() => onVerdict(true)}
          >
            ✓ נכון
          </button>
          <button
            type="button"
            className={`chip ${verdict === false ? 'grade-wrong' : ''}`}
            onClick={() => onVerdict(false)}
          >
            ✗ לא נכון
          </button>
        </div>
      )}

      {reveal && !onVerdict && verdict !== undefined && (
        <p className="meta" style={{ marginTop: 8 }}>
          {verdict ? '✓ סומן כנכון' : '✗ סומן כלא נכון'}
        </p>
      )}
    </div>
  );
}

/**
 * One typed numeric result. On reveal it grades itself against the official
 * value and shows the check outcome; an empty or unreadable entry is simply
 * left unmarked.
 */
function AnswerField({ spec, value, onChange, reveal }) {
  const label = spec.label ?? '';
  const unit = ANSWER_TYPES[spec.type].unit;

  if (spec.type === 'position') {
    return (
      <>
        {label && <span className="meta">{label}:</span>}
        <CheckedInput spec={spec} value={value} onChange={onChange} reveal={reveal} placeholder={"32° 46.2'N"} axis={0} />
        <CheckedInput spec={spec} value={value} onChange={onChange} reveal={reveal} placeholder={"034° 10.0'E"} axis={1} />
      </>
    );
  }

  return (
    <>
      {label && <span className="meta">{label}:</span>}
      <CheckedInput spec={spec} value={value} onChange={onChange} reveal={reveal} placeholder={PLACEHOLDERS[spec.type]} />
      {unit && <span className="meta">{unit}</span>}
    </>
  );
}

function CheckedInput({ spec, value, onChange, reveal, placeholder, axis }) {
  // A position is a pair of fields sharing one spec; other types are a single
  // field. Either way `value` reaches checkAnswer in the shape parseAnswerValue
  // expects for the type.
  const pair = axis !== undefined;
  const raw = pair ? (value ?? [])[axis] ?? '' : value ?? '';
  const whole = pair ? value ?? [] : value;

  const verdict = reveal ? checkAnswer(spec, pair ? [whole[0] ?? '', whole[1] ?? ''] : whole) : null;
  const cls = verdict === null ? '' : verdict ? 'right' : 'wrong';

  return (
    <input
      className={`open-input ${cls}`}
      type="text"
      dir="ltr"
      value={raw}
      placeholder={placeholder ?? ''}
      disabled={!onChange || reveal}
      onChange={(e) => {
        if (!onChange) return;
        if (pair) {
          const next = [...whole];
          next[axis] = e.target.value;
          onChange(next);
        } else {
          onChange(e.target.value);
        }
      }}
    />
  );
}
