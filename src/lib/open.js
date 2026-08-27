// Open-question (chart-work) subjects: answer parsing, tolerance checking and
// attempt scoring.
//
// Shared between the app and scripts/validate-subject.mjs — plain ESM with no
// browser or React dependency — so the validator can never accept an answer
// value the app later fails to parse.
//
// A part's `answers` entry describes one typed numeric result the learner can
// key in and have checked automatically. Parts without `answers` (נמק, הסבר,
// פרט) are self-graded against the official solution.

// Hebrew enumeration order, as the exam prints it — question 16 runs to טו.
export const PART_KEYS = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
];

/**
 * The closed set of typed-answer kinds and their default tolerances — the
 * slack chart work legitimately produces, not a grading opinion. A single
 * answer can widen its own with a `tolerance` field (a "בערך" answer).
 */
export const ANSWER_TYPES = {
  course: { tolerance: 2, unit: '°' }, // any direction: קורס, תכוון, כיוון זרם
  variation: { tolerance: 0.5, unit: '°' }, // signed; E positive
  speed: { tolerance: 0.25, unit: 'kn' },
  distance: { tolerance: 0.2, unit: 'מיל' },
  depth: { tolerance: 0.2, unit: "מ'" },
  height: { tolerance: 0.2, unit: "מ'" },
  time: { tolerance: 5, unit: "דק'" }, // wall clock, circular over midnight
  minutes: { tolerance: 5, unit: "דק'" }, // a duration, not a wall clock
  position: { tolerance: 0.2, unit: "'" }, // per component, minutes of arc
  scale: { tolerance: 0, unit: '' }, // exact: קנ"מ 1:30000
  number: { tolerance: 0, unit: '' }, // exact count: מספר מצופים וכד'
};

const toNumber = (raw) => {
  const s = String(raw).trim().replace(',', '.').replace(/[°'"]/g, '');
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/** "4°20'W" | "7°E" | "4.5 W" → signed degrees, E positive. */
function parseVariation(raw) {
  const s = String(raw).trim().toUpperCase();
  const hem = s.match(/[EW]/)?.[0];
  const nums = s.replace(/[EW]/g, ' ').match(/\d+(?:\.\d+)?/g);
  if (!hem || !nums) return null;
  const deg = Number(nums[0]) + (nums[1] ? Number(nums[1]) / 60 : 0);
  return hem === 'W' ? -deg : deg;
}

/** "15:00" | "1500" | "8:30" → minutes since midnight. */
function parseClock(raw) {
  const m = String(raw).trim().match(/^(\d{1,2})[:.]?([0-5]\d)$/);
  if (!m || Number(m[1]) > 23) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** One coordinate, "32° 46.2'N" | "034 10 E" | "32°55.5" → signed arc-minutes. */
function parseCoordinate(raw, axis) {
  const s = String(raw).trim().toUpperCase();
  const hem = s.match(/[NSEW]/)?.[0] ?? (axis === 'lat' ? 'N' : 'E');
  const nums = s.replace(/[NSEW]/g, ' ').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length > 2) return null;
  const minutes = nums[1] ? Number(nums[1]) : 0;
  if (minutes >= 60) return null;
  const total = Number(nums[0]) * 60 + minutes;
  return hem === 'S' || hem === 'W' ? -total : total;
}

/** "1:30000" | "1/30,000" → the denominator. */
function parseScale(raw) {
  const m = String(raw).trim().match(/^1\s*[:/]\s*(\d[\d,.]*)$/);
  return m ? Number(m[1].replace(/[,.]/g, '')) : null;
}

/**
 * Parse either side — the official `value` from questions.json or the text the
 * learner typed — into the canonical form the tolerance is measured in.
 * Returns null when unparseable; the official side being null is a content
 * bug, which is exactly what the validator uses this to catch.
 */
export function parseAnswerValue(type, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  switch (type) {
    case 'course': {
      const n = toNumber(raw);
      return n !== null && n >= 0 && n <= 360 ? n % 360 : null;
    }
    case 'variation':
      return typeof raw === 'number' ? raw : parseVariation(raw);
    case 'speed':
    case 'distance':
    case 'depth':
    case 'height':
    case 'minutes': {
      const n = toNumber(raw);
      return n !== null && n >= 0 ? n : null;
    }
    case 'number': {
      const n = toNumber(raw);
      return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
    }
    case 'time':
      return parseClock(raw);
    case 'scale':
      return parseScale(raw);
    case 'position': {
      if (!Array.isArray(raw) || raw.length !== 2) return null;
      const lat = parseCoordinate(raw[0], 'lat');
      const lon = parseCoordinate(raw[1], 'lon');
      return lat !== null && lon !== null ? { lat, lon } : null;
    }
    default:
      return null;
  }
}

const circularDiff = (a, b, span) => {
  const d = Math.abs(a - b) % span;
  return Math.min(d, span - d);
};

/**
 * Check what the learner typed against one official answer.
 * Returns true/false, or null when the input is empty or unreadable — the UI
 * treats null as "not checked", never as wrong.
 */
export function checkAnswer(spec, raw) {
  const expected = parseAnswerValue(spec.type, spec.value);
  const given = parseAnswerValue(spec.type, raw);
  if (expected === null || given === null) return null;
  const tolerance = spec.tolerance ?? ANSWER_TYPES[spec.type].tolerance;
  switch (spec.type) {
    case 'course':
      return circularDiff(given, expected, 360) <= tolerance;
    case 'time':
      return circularDiff(given, expected, 24 * 60) <= tolerance;
    case 'position':
      return (
        Math.abs(given.lat - expected.lat) <= tolerance &&
        Math.abs(given.lon - expected.lon) <= tolerance
      );
    default:
      return Math.abs(given - expected) <= tolerance;
  }
}

/**
 * Score a handed-in open paper from per-part verdicts.
 *
 * `verdicts` is { [questionId]: boolean[] } aligned with the question's parts
 * — auto-checked where the part is typed, self-graded otherwise. The result
 * matches scoreAttempt's shape so recordAttempt and the progress screen work
 * unchanged; `right`/`total`/`score` count parts, since one exercise here is
 * worth several independent results.
 */
export function scoreOpenAttempt(subject, attempt, verdicts) {
  const rows = attempt.questionIds.map((id) => {
    const q = subject.byId.get(id);
    const given = verdicts[id] ?? [];
    const partsRight = q.parts.filter((_, i) => given[i] === true).length;
    return {
      id,
      topic: q.topic,
      given,
      partsRight,
      partsTotal: q.parts.length,
      right: partsRight === q.parts.length,
      critical: false,
    };
  });

  const right = rows.reduce((n, r) => n + r.partsRight, 0);
  const total = rows.reduce((n, r) => n + r.partsTotal, 0);
  const score = total ? Math.round((right / total) * 100) : 0;

  const byTopic = new Map();
  for (const r of rows) {
    const t = byTopic.get(r.topic) ?? { topic: r.topic, total: 0, right: 0 };
    t.total += r.partsTotal;
    t.right += r.partsRight;
    byTopic.set(r.topic, t);
  }

  return {
    rows,
    right,
    total,
    score,
    passed: score >= subject.exam.pass,
    pass: subject.exam.pass,
    criticalMisses: [],
    criticalRule: null,
    byTopic: [...byTopic.values()].sort((a, b) => a.right / a.total - b.right / b.total),
    mistakes: rows.filter((r) => !r.right),
  };
}
