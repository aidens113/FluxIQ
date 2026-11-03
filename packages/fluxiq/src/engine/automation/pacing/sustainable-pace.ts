// The spacing a site's limit allows between two acts, from what one run saw of
// it (t485).
//
// Lane D round 12 (`run-mv62icw0-070f88ad`, D1): a refusal's hint is how long
// until the site lets one more act through, not a spacing that holds. The page
// allowed three acts in any 15 s; the trial's fourth act was refused with a
// 4.5 s hint, the run learned a 4.5 s pace from it, and playback held to 4.5 s
// was refused again on its fourth act, 13.5 s after its first.
//
// A limit of N acts in any window W is inferred from this run's own starts of
// the node and the refusal. The hint says when the window frees a place
// (`freeAt`). If the window held the last k acts the site let through, W is
// `freeAt` less the k-th latest of them, and the spacing is W / k. A k holds
// only when every act let through had fewer than k acts let through in the W
// before it; otherwise the site would have refused that act too. Of the k that
// hold, the widest spacing is taken: the true one is always among them, so the
// answer never falls short of what this run's own acts show. An act made
// outside the run is not seen; a further refusal answers that, by the pace
// keeper's growth. The answer keeps a tenth's margin above the bare spacing:
// the run's clock is not the site's, and an act on the window's edge may be
// refused.
//
// The limit is never read from a page's own statement of it: no record that
// reaches Core carries one (a failure record carries only its wait,
// `retryAfterMs`; a closed layer only its kind and way out), and the page's
// words are not parsed here.

/** The margin above a bare spacing, in tenths of it. */
const MARGIN_TENTHS = 11;

/** How much of a window an earlier act may sit at the edge of and still not count against a k (clock skew). */
const EDGE_SLACK = 0.1;

/**
 * The least spacing, in whole milliseconds, that respects the limit implied by
 * `letThrough` (the run's starts of the node the site let through) and
 * `freeAt` (when the refusal said a place frees), or nothing when no start
 * explains the refusal.
 */
export function automationStudioSustainablePaceMs(input: { letThrough: readonly number[]; freeAt: number }): number | undefined {
  if (!Number.isFinite(input.freeAt)) return undefined;
  const starts = input.letThrough.filter((at) => Number.isFinite(at) && at < input.freeAt).sort((a, b) => a - b);
  let widest: number | undefined;
  for (let k = 1; k <= starts.length; k += 1) {
    const windowMs = input.freeAt - starts[starts.length - k]!;
    if (!holds(starts, k, windowMs)) continue;
    const spacing = Math.ceil((windowMs * MARGIN_TENTHS) / (k * 10));
    if (widest === undefined || spacing > widest) widest = spacing;
  }
  return widest;
}

/** Whether every start let through had fewer than `k` others let through in the `windowMs` before it. */
function holds(starts: readonly number[], k: number, windowMs: number): boolean {
  const reach = windowMs * (1 - EDGE_SLACK);
  return starts.every((at, index) => starts.slice(0, index).filter((earlier) => at - earlier < reach).length < k);
}
