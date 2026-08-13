// Deterministic shuffling.
//
// Every exam attempt stores the seed it was generated from, so the exact same
// paper — same questions, same option order — can be rebuilt when reviewing it.

/** mulberry32: small, fast, and stable across reloads. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

/** Fisher–Yates against a seeded generator; returns a new array. */
export function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Derive an independent stream from a base seed, so option order does not
 *  shift when question order changes. */
export const deriveSeed = (seed, n) => (Math.imul(seed ^ (n + 0x9e3779b9), 0x85ebca6b) >>> 0);
