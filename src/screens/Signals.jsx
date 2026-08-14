import { useMemo, useState } from 'react';
import { SECTIONS, SIGNALS } from '../data/signals.js';

/**
 * אורות וסימנים — the official RASPAN booklet, browsable: every numbered image
 * with its official meaning, filterable by the booklet's own sections. Exam
 * questions reference these by "תמונה N", so the numbers stay front and centre.
 */
export default function Signals() {
  const [section, setSection] = useState(SECTIONS[0].id);
  const [query, setQuery] = useState('');

  const active = SECTIONS.find((s) => s.id === section);
  const items = useMemo(() => {
    const q = query.trim();
    return SIGNALS.filter((s) => {
      const inSection = s.n >= active.range[0] && s.n <= active.range[1];
      if (!q) return inSection;
      // A numeric search finds the exact figure anywhere; text searches within
      // the current section.
      if (/^\d+$/.test(q)) return s.n === Number(q);
      return inSection && s.he.includes(q);
    });
  }, [active, query]);

  return (
    <>
      <p className="meta">
        חוברת העזר הרשמית של רספ״ן למבחני משיט — כל תמונה עם פירושה הרשמי. השאלות בבחינה מפנות
        למספרי התמונות שכאן.
      </p>

      <div className="chips">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${section === s.id ? 'on' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.he} ({s.range[1] - s.range[0] + 1})
          </button>
        ))}
      </div>

      <input
        type="search"
        className="signal-search"
        placeholder="חיפוש לפי טקסט, או מספר תמונה"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {active.note && !query && <p className="notice info">{active.note}</p>}

      {items.length === 0 && <p className="meta">אין תוצאות.</p>}

      <div className="signal-grid">
        {items.map((s) => (
          <figure key={s.n} className="card signal">
            <img
              src={`/signals/t-${String(s.n).padStart(3, '0')}.png`}
              alt={`תמונה ${s.n}`}
              loading="lazy"
            />
            <figcaption>
              <span className="pill">תמונה {s.n}</span>
              <p>{s.he}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
