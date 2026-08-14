import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOXES,
  answerCard,
  buildDeck,
  buildSession,
  currentCard,
  deckOverview,
  grade,
  roundDone,
  roundProgress,
  startRound,
  summarizeRound,
} from '../lib/leitner.js';
import { loadDeck, saveDeck } from '../lib/progress.js';
import { read, write } from '../lib/storage.js';

const ROUND_SIZES = [10, 15, 25];
const DIRECTION_LABEL = { term: 'מונח ← הגדרה', definition: 'הגדרה ← מונח' };

/** שינון — a dashboard, a finite round, a summary. */
export default function Learn({ subject }) {
  const [state, setState] = useState(() => loadDeck(subject.slug));
  const [topic, setTopic] = useState(null);
  const [prefs, setPrefs] = useState(() => read(subject.slug, 'prefs', { roundSize: 15 }));
  const [round, setRound] = useState(null);
  const [summary, setSummary] = useState(null);
  // Deck state as it stood when the round began — the summary compares to it.
  const stateAtStart = useRef(null);

  const deck = useMemo(() => buildDeck(subject.terms, { topic }), [subject.terms, topic]);
  const topics = useMemo(
    () => [...new Map(subject.terms.map((t) => [t.topic.he, t.topic])).values()],
    [subject.terms],
  );

  const setRoundSize = (roundSize) => {
    const next = { ...prefs, roundSize };
    setPrefs(next);
    write(subject.slug, 'prefs', next);
  };

  const start = (studyAhead = false) => {
    const cards = buildSession(deck, state, { size: prefs.roundSize, studyAhead });
    if (!cards.length) return;
    stateAtStart.current = state;
    setSummary(null);
    setRound(startRound(cards));
  };

  const onGrade = (known) => {
    const card = currentCard(round);
    const { round: next, countsForBox } = answerCard(round, known);
    if (countsForBox) {
      const nextState = grade(state, card.id, known);
      setState(nextState);
      saveDeck(subject.slug, nextState);
    }
    if (roundDone(next)) {
      setSummary(summarizeRound(next, stateAtStart.current));
      setRound(null);
    } else {
      setRound(next);
    }
  };

  if (round) {
    return <Round round={round} onGrade={onGrade} onQuit={() => setRound(null)} />;
  }
  if (summary) {
    return (
      <Summary
        summary={summary}
        onAgain={() => start(false)}
        onBack={() => setSummary(null)}
        canAgain={deckOverview(deck, state).due + deckOverview(deck, state).fresh > 0}
      />
    );
  }
  return (
    <Entry
      deck={deck}
      state={state}
      topics={topics}
      topic={topic}
      onTopic={setTopic}
      roundSize={prefs.roundSize}
      onRoundSize={setRoundSize}
      onStart={start}
    />
  );
}

/* ---------------------------------------------------------------- entry -- */

function Entry({ deck, state, topics, topic, onTopic, roundSize, onRoundSize, onStart }) {
  const overview = useMemo(() => deckOverview(deck, state), [deck, state]);
  const nothingWaiting = overview.due === 0 && overview.fresh === 0;
  const max = Math.max(...overview.counts, 1);

  return (
    <>
      <div className="card">
        <p className="meta">לחזרה עכשיו</p>
        <p className="deck-count">
          {overview.due + overview.fresh}{' '}
          <span className="meta">
            כרטיסיות{overview.fresh > 0 && ` · מתוכן ${overview.fresh} חדשות`}
          </span>
        </p>
        <p className="meta">
          {overview.learned} מתוך {overview.total} בקופסה האחרונה
        </p>
        <div className="boxes" aria-hidden="true">
          {overview.counts.map((n, i) => (
            <div key={i} className="b">
              <i style={{ height: `${Math.max((n / max) * 52, 3)}px` }} />
              <small>
                קופסה {i + 1} · {n}
              </small>
            </div>
          ))}
        </div>
      </div>

      <p className="meta">נושא</p>
      <div className="chips">
        <button type="button" className={`chip ${topic ? '' : 'on'}`} onClick={() => onTopic(null)}>
          הכול
        </button>
        {topics.map((t) => {
          const n = overview.dueByTopic.get(t.he) ?? 0;
          return (
            <button
              key={t.he}
              type="button"
              className={`chip ${topic === t.he ? 'on' : ''}`}
              onClick={() => onTopic(topic === t.he ? null : t.he)}
            >
              {t.he}
              {n > 0 && ` (${n})`}
            </button>
          );
        })}
      </div>

      <p className="meta">אורך הסבב</p>
      <div className="chips">
        {ROUND_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip ${roundSize === n ? 'on' : ''}`}
            onClick={() => onRoundSize(n)}
          >
            {n}
          </button>
        ))}
      </div>

      {nothingWaiting ? (
        <>
          <p className="notice info">
            אין כרטיסיות לחזרה כרגע — הכול מתוזמן קדימה.
            {overview.nextDue && ` הכרטיסיות הקרובות יחזרו ${formatWhen(overview.nextDue)}.`}
          </p>
          <button type="button" className="btn ghost" onClick={() => onStart(true)}>
            סבב חופשי בכל זאת
          </button>
        </>
      ) : (
        <button type="button" className="btn start-round" onClick={() => onStart(false)}>
          ▶ התחלת סבב
        </button>
      )}
    </>
  );
}

function formatWhen(ts) {
  const hours = Math.round((ts - Date.now()) / 3_600_000);
  if (hours <= 1) return 'בתוך פחות משעה';
  if (hours < 24) return `בתוך כ-${hours} שעות`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'מחר' : `בתוך כ-${days} ימים`;
}

/* ---------------------------------------------------------------- round -- */

const SWIPE_THRESHOLD_RATIO = 0.35;

function Round({ round, onGrade, onQuit }) {
  const card = currentCard(round);
  const { answered, total } = roundProgress(round);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(0);
  // Snapshot of the just-graded card, rendered as a ghost playing its fly-off.
  // Purely visual: engine state has already advanced by the time it exists.
  const [exiting, setExiting] = useState(null);
  const [preFlipHint, setPreFlipHint] = useState(false);
  const surface = useRef(null);
  const pointer = useRef(null);
  // Set during a drag, read by the click that trails it. A ref, not state:
  // onPointerUp resets `drag` before the click event fires, so state cannot
  // tell a drag-click from a tap.
  const dragHappened = useRef(false);

  // A new card arrives face down, not mid-drag.
  useEffect(() => {
    setFlipped(false);
    setDrag(0);
  }, [card?.id, round.cursor]);

  // The ghost removes itself; a timeout backstops animationend not firing
  // (reduced motion, tab hidden).
  useEffect(() => {
    if (!exiting) return undefined;
    const t = setTimeout(() => setExiting(null), 400);
    return () => clearTimeout(t);
  }, [exiting]);

  // Grade NOW — no timer between the user's action and the state change.
  // The outgoing card becomes a ghost so the fly-off still reads.
  const settle = (known, from = drag) => {
    setExiting({ card, known, from });
    onGrade(known);
  };

  // Keyboard: flip first, grade after.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && (e.key === 'ArrowLeft' || e.key === '1')) {
        e.preventDefault();
        settle(true);
      } else if (flipped && (e.key === 'ArrowRight' || e.key === '2')) {
        e.preventDefault();
        settle(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const width = () => surface.current?.offsetWidth ?? 320;

  const onPointerDown = (e) => {
    pointer.current = { x: e.clientX, id: e.pointerId };
    dragHappened.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!pointer.current) return;
    const dx = e.clientX - pointer.current.x;
    if (Math.abs(dx) > 6) dragHappened.current = true;
    // The gesture's truth lives on the ref: pointer events can arrive faster
    // than renders, so state read back in onPointerUp may be a frame stale.
    pointer.current.dx = dx;
    if (!flipped) {
      // Face-down cards do not grade: a little resistance, then a hint.
      setDrag(Math.max(-24, Math.min(24, dx / 3)));
      if (Math.abs(dx) > 40) setPreFlipHint(true);
      return;
    }
    setDrag(dx);
  };
  const onPointerUp = () => {
    if (!pointer.current) return;
    const dx = pointer.current.dx ?? 0;
    pointer.current = null;
    if (!flipped) {
      setDrag(0);
      return;
    }
    if (Math.abs(dx) > width() * SWIPE_THRESHOLD_RATIO) {
      settle(dx < 0, dx); // leftwards = זכרתי
    } else {
      setDrag(0);
    }
  };

  const overlayStrength = Math.min(Math.abs(drag) / (width() * SWIPE_THRESHOLD_RATIO), 1);
  const dragStyle = {
    transform: `translateX(${drag}px) rotate(${drag / 22}deg)`,
    transition: pointer.current ? 'none' : undefined,
  };

  return (
    <>
      <div className="bar">
        <i style={{ width: `${(answered / total) * 100}%` }} />
      </div>
      <div className="row round-meta">
        <span className="meta">
          {Math.min(answered + 1, total)} מתוך {total}
        </span>
        <span style={{ flex: 1 }} />
        <span className="pill">{DIRECTION_LABEL[card.direction]}</span>
      </div>
      <p className="meta">{card.topic}</p>

      <div className="swipe-stage">
        {exiting && (
          <div
            className={`swipe-wrap ghost fly-${exiting.known ? 'know' : 'dont'}`}
            style={{ '--from': `${exiting.from}px` }}
            aria-hidden="true"
          >
            <div className="flipcard flipped static">
              <span className="face back">
                <span className="flash-answer">{exiting.card.back}</span>
              </span>
            </div>
            <span className={`stamp ${exiting.known ? 'know' : 'dont'}`}>
              {exiting.known ? '✓ זכרתי' : '✗ לא זכרתי'}
            </span>
          </div>
        )}
        <div className="swipe-wrap" ref={surface} style={dragStyle}>
        <button
          type="button"
          className={`flipcard ${flipped ? 'flipped' : ''}`}
          onClick={() => {
            if (dragHappened.current) {
              dragHappened.current = false;
              return; // the click at the end of a drag is not a tap
            }
            setFlipped((f) => !f);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={flipped ? 'הכרטיסייה חשופה' : 'הקשה לחשיפת הכרטיסייה'}
        >
          <span className="face front">
            <span className="flash-main">{card.front}</span>
            <span className="flash-hint">· הקשה לחשיפה ·</span>
          </span>
          <span className="face back">
            <span className="flash-answer">{card.back}</span>
            <span className="flash-hint">{card.topic}</span>
          </span>
        </button>
        {flipped && (
          <>
            <span className="stamp know" style={{ opacity: drag < 0 ? overlayStrength : 0 }}>
              ✓ זכרתי
            </span>
            <span className="stamp dont" style={{ opacity: drag > 0 ? overlayStrength : 0 }}>
              ✗ לא זכרתי
            </span>
          </>
        )}
        </div>
      </div>

      <div className="row">
        <button type="button" className="btn know" disabled={!flipped} onClick={() => settle(true)}>
          ✓ זכרתי
        </button>
        <button type="button" className="btn ghost" disabled={!flipped} onClick={() => settle(false)}>
          ✗ לא זכרתי
        </button>
      </div>

      <p className="meta swipe-hint">
        {preFlipHint && !flipped
          ? 'קודם חושפים — הקשה על הכרטיסייה'
          : flipped
            ? 'החלקה שמאלה = זכרתי · ימינה = לא זכרתי'
            : 'הקשה או רווח לחשיפה'}
      </p>

      <div className="row end">
        <button type="button" className="chip" onClick={onQuit}>
          סיום מוקדם
        </button>
      </div>
    </>
  );
}


/* -------------------------------------------------------------- summary -- */

function Summary({ summary, onAgain, onBack, canAgain }) {
  const pct = summary.total ? Math.round((summary.known / summary.total) * 100) : 0;

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.6rem' }}>{pct >= 80 ? '🎯' : '📚'}</div>
        <p className="deck-count" style={{ margin: '4px 0' }}>
          זכרת {summary.known} מתוך {summary.total}
        </p>
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="card">
        <div className="sumline">
          <span className="ico up">▲</span>
          <span>{summary.promoted} כרטיסיות עלו קופסה</span>
        </div>
        <div className="sumline">
          <span className="ico down">▼</span>
          <span>{summary.reset} חזרו לקופסה הראשונה</span>
        </div>
        {summary.reachedTop > 0 && (
          <div className="sumline">
            <span className="ico">★</span>
            <span>{summary.reachedTop} הגיעו לקופסה {BOXES} — הקופסה האחרונה</span>
          </div>
        )}
      </div>

      {summary.missedCards.length > 0 && (
        <div className="card">
          <p className="meta">לחזרה בסבב הבא</p>
          <p style={{ margin: 0 }}>
            {summary.missedCards
              .map((c) => (c.direction === 'term' ? c.front : c.back))
              .join(' · ')}
          </p>
        </div>
      )}

      <div className="row">
        <button type="button" className="btn" disabled={!canAgain} onClick={onAgain}>
          עוד סבב
        </button>
        <button type="button" className="btn ghost" onClick={onBack}>
          חזרה
        </button>
      </div>
    </>
  );
}
