import { useMemo, useState } from 'react';
import { highlightTerms } from '../lib/highlight.js';

/**
 * Hebrew text with its technical terms underlined. Tapping one opens its
 * Hebrew definition underneath — the whole point of the app is that she picks
 * up the vocabulary while drilling, so the explanation stays in Hebrew too.
 */
export default function TermText({ text, terms, enabled = true }) {
  const [open, setOpen] = useState(null);
  const segments = useMemo(
    () => (enabled ? highlightTerms(text, terms) : [{ text }]),
    [text, terms, enabled],
  );

  return (
    <>
      <span>
        {segments.map((seg, i) =>
          seg.term ? (
            <button
              key={i}
              type="button"
              className="term"
              aria-label={`הסבר למונח ${seg.term.he}`}
              onClick={() => setOpen(open?.id === seg.term.id ? null : seg.term)}
            >
              {seg.text}
            </button>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>

      {open && (
        <p className="termbox">
          <button type="button" className="back close" onClick={() => setOpen(null)}>
            סגירה
          </button>
          <b>{open.he}</b>
          {open.definition}
        </p>
      )}
    </>
  );
}
