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

  const toggle = (term) => setOpen(open?.id === term.id ? null : term);

  return (
    <>
      <span>
        {segments.map((seg, i) =>
          seg.term ? (
            // A span, not a <button>: buttons are inline-block, so a term
            // wrapped to the next line as one piece and left its prefix
            // letter ("ב" of "במערכת") stranded on the line above.
            <span
              key={i}
              role="button"
              tabIndex={0}
              className="term"
              aria-label={`הסבר למונח ${seg.term.he}`}
              onClick={() => toggle(seg.term)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(seg.term);
                }
              }}
            >
              {seg.text}
            </span>
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
