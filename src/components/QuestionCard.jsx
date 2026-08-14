import { useEffect } from 'react';
import TermText from './TermText.jsx';

/**
 * One question with its four options.
 *
 * `reveal` switches it from answering to showing the outcome, which is what
 * separates תרגול (reveal immediately) from סימולציה (reveal only after
 * submitting the whole paper).
 */
export default function QuestionCard({
  question,
  order,
  terms,
  picked,
  reveal = false,
  onPick,
  showNote = false,
  index,
  total,
  children,
}) {
  const keys = order ?? ['א', 'ב', 'ג', 'ד'];
  const termRecords = (question.terms ?? []).map((id) => terms.get(id)).filter(Boolean);

  // Keyboard answering: 1–4 by position, or the Hebrew letter itself.
  useEffect(() => {
    if (reveal || !onPick) return undefined;
    const onKey = (e) => {
      const byNumber = keys[Number(e.key) - 1];
      const byLetter = keys.includes(e.key) ? e.key : null;
      const choice = byNumber ?? byLetter;
      if (choice) {
        e.preventDefault();
        onPick(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, onPick, reveal]);

  const classFor = (key) => {
    if (!reveal) return picked === key ? 'option picked' : 'option';
    if (key === question.correct) return 'option right';
    if (key === picked) return 'option wrong';
    return 'option';
  };

  return (
    <section className="card">
      {(index != null) && (
        <p className="meta">
          שאלה {index + 1} מתוך {total} · {question.topic}
        </p>
      )}

      <p className="qtext">
        <TermText text={question.question} terms={termRecords} />
      </p>

      {question.image && <img className="qimage" src={question.image} alt="" />}

      {/* ימאות questions name plates from the official אורות וסימנים booklet —
          often two of them in one scenario — so the figures come as a strip. */}
      {question.figures?.length > 0 && (
        <div className="qfigs">
          {question.figures.map((fig) => (
            <figure key={fig.src}>
              {/* The position wheel is a tall plate with sixteen labels, so on a
                  phone it needs a way to be opened at full size. */}
              <a href={fig.src} target="_blank" rel="noreferrer">
                <img src={fig.src} alt="" loading="lazy" />
              </a>
              <figcaption>{fig.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {question.issue && (
        <p className="notice">⚠ {question.issue}</p>
      )}

      <div className="options">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={classFor(key)}
            disabled={reveal || !onPick}
            onClick={() => onPick?.(key)}
          >
            <span className="key" aria-hidden="true">{key}</span>
            <span>
              <TermText text={question.options[key]} terms={termRecords} enabled={reveal} />
              {reveal && question.reconstructed?.includes(key) && (
                <span className="meta"> · נוסח משוחזר</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {reveal && showNote && question.note && <p className="notice">הערה: {question.note}</p>}
      {children}
    </section>
  );
}
