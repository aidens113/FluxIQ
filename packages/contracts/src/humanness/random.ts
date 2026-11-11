/**
 * The seeded generator every humanness choice draws from (mulberry32): the same seed
 * gives the same sequence in Core and in the browser, so a run whose seed is in its
 * step log can be replayed choice for choice. Returns numbers in [0, 1).
 * Not for anything secret: it is fast and reproducible, not unpredictable.
 */
export function humannessRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
