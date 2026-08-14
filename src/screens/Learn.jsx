import { useMemo, useState } from 'react';
import { BOXES, buildDeck, deckStats, dueCards, grade } from '../lib/leitner.js';
import { loadDeck, saveDeck } from '../lib/progress.js';

const DIRECTION_LABEL = {
  term: 'מהי ההגדרה?',
  definition: 'מהו המונח?',
};

/** שינון — two-way flashcards over the subject's term dictionary. */
export default function Learn({ subject }) {
  const [state, setState] = useState(() => loadDeck(subject.slug));
  const [topic, setTopic] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [position, setPosition] = useState(0);

  const topics = useMemo(
    () => [...new Map(subject.terms.map((t) => [t.topic.he, t.topic])).values()],
    [subject.terms],
  );
  const deck = useMemo(() => buildDeck(subject.terms, { topic }), [subject.terms, topic]);
  const queue = useMemo(() => dueCards(deck, state), [deck, state, position]);
  const stats = deckStats(deck, state);
  const card = queue[0];

  const answer = (known) => {
    const next = grade(state, card.id, known);
    setState(next);
    saveDeck(subject.slug, next);
    setFlipped(false);
    setPosition((n) => n + 1);
  };

  return (
    <>
      <div className="card">
        <div className="row">
          <b>שינון מונחים</b>
          <span style={{ flex: 1 }} />
          <span className="pill">{stats.learned} / {stats.total} בקופסה {BOXES}</span>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${stats.total ? (stats.learned / stats.total) * 100 : 0}%` }} />
        </div>
        <p className="meta">
          כל מונח מופיע בשני הכיוונים: פעם מהמונח להגדרה ופעם מההגדרה למונח.
        </p>
      </div>

      <div className="chips">
        <button type="button" className={`chip ${topic ? '' : 'on'}`} onClick={() => setTopic(null)}>
          הכול
        </button>
        {topics.map((t) => (
          <button
            key={t.he}
            type="button"
            className={`chip ${topic === t.he ? 'on' : ''}`}
            onClick={() => { setTopic(t.he); setFlipped(false); }}
          >
            {t.he}
          </button>
        ))}
      </div>

      {!card ? (
        <p className="notice info">אין כרטיסיות בנושא הזה.</p>
      ) : (
        <>
          <p className="meta">{DIRECTION_LABEL[card.direction]} · {card.topic}</p>

          <button
            type="button"
            className="card flash"
            onClick={() => setFlipped((f) => !f)}
          >
            {flipped ? (
              <span className="answer">{card.back}</span>
            ) : (
              <span>
                {card.front}
                <span className="hint">להקיש כדי לחשוף</span>
              </span>
            )}
          </button>

          <div className="row">
            <button type="button" className="btn ghost" disabled={!flipped} onClick={() => answer(false)}>
              לא זכרתי
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn" disabled={!flipped} onClick={() => answer(true)}>
              זכרתי
            </button>
          </div>
          <p className="meta">
            קופסה נוכחית: {state[card.id]?.box ?? 1} מתוך {BOXES} · נותרו {queue.length} בסבב הזה
          </p>
        </>
      )}
    </>
  );
}
