// The run ordinals a shape checks, as a sequence.
//
// The whole schedule is this one function plus two overrides in `decide.ts`.
// Generating the sequence, rather than carrying an interval forward in stored
// state, is what makes every shape provable without a database: the ordinals
// below are exactly the ones tabulated in the design, and a test asserts them
// literally rather than re-deriving them from the same arithmetic it is meant
// to be checking.
//
// With the defaults (`initialRunCount` 3, `interval` 5, `decay` 5):
//
//   initial_then_exponential   1, 2, 3, 8, 33, 158, 783      5 checks in 50 runs
//   linear_decay               1, 2, 3, 8, 18, 33, 53        6 checks in 50 runs
//   fixed_interval             1, 2, 3, 8, 13, 18, 23 ...   12 checks in 50 runs
//   every_run                  every ordinal                50 checks in 50 runs
//   never                      none                          0

import type { AutomationStudioResultCheckSettings, AutomationStudioResultCheckShape } from "./settings.ts";

/**
 * Every ordinal this shape checks up to and including `upToOrdinal`.
 *
 * Settings are read defensively: a stored `interval` of 0 would otherwise make
 * the loop below never terminate, so each is floored at the smallest value
 * that still means something. `enabled: false` and the `never` shape both
 * produce no ordinals, and are told apart by `decide.ts` rather than here.
 */
export function automationStudioResultCheckOrdinals(settings: AutomationStudioResultCheckSettings, upToOrdinal: number): number[] {
  const bound = Math.max(0, Math.trunc(upToOrdinal));
  if (!settings.enabled || settings.shape === "never" || bound < 1) return [];
  const initial = Math.max(0, Math.trunc(settings.initialRunCount));
  const checked: number[] = [];
  for (let ordinal = 1; ordinal <= Math.min(initial, bound); ordinal += 1) checked.push(ordinal);
  if (settings.shape === "every_run") {
    for (let ordinal = initial + 1; ordinal <= bound; ordinal += 1) checked.push(ordinal);
    return checked;
  }
  let cursor = initial;
  let widenings = 0;
  for (;;) {
    const next = cursor + intervalAfter(settings, widenings);
    if (next > bound) return checked;
    checked.push(next);
    cursor = next;
    widenings += 1;
  }
}

/** The first ordinal after `ordinal` that this shape checks, or null when it checks no more. */
export function automationStudioNextResultCheckOrdinal(settings: AutomationStudioResultCheckSettings, ordinal: number): number | null {
  if (!settings.enabled || settings.shape === "never") return null;
  const from = Math.max(0, Math.trunc(ordinal));
  const initial = Math.max(0, Math.trunc(settings.initialRunCount));
  if (from < initial) return from + 1;
  if (settings.shape === "every_run") return from + 1;
  let cursor = initial;
  let widenings = 0;
  // Bounded by construction: every interval is at least 1, so the cursor rises
  // on every pass and this returns within `next - from` iterations.
  for (;;) {
    const next = cursor + intervalAfter(settings, widenings);
    if (next > from) return next;
    cursor = next;
    widenings += 1;
  }
}

/**
 * How far the next check falls after the previous one, once the initial window
 * has passed. `widenings` is how many checks have already been made beyond that
 * window, so the first interval is `interval` itself and the decay only starts
 * afterwards.
 */
function intervalAfter(settings: AutomationStudioResultCheckSettings, widenings: number): number {
  const interval = Math.max(1, Math.trunc(settings.interval));
  const decay = Math.max(1, Math.trunc(settings.decay));
  const widened = widenShape(settings.shape, interval, decay, widenings);
  const ceiling = settings.maxInterval === undefined ? undefined : Math.max(1, Math.trunc(settings.maxInterval));
  // `Number.MAX_SAFE_INTEGER` is the backstop on an exponential nobody capped:
  // at decay 5 the interval passes it by the twenty-third check, and an ordinal
  // that is not a safe integer would compare wrongly against a run count.
  return Math.min(ceiling ?? Number.MAX_SAFE_INTEGER, Math.max(1, Math.min(widened, Number.MAX_SAFE_INTEGER)));
}

function widenShape(shape: AutomationStudioResultCheckShape, interval: number, decay: number, widenings: number): number {
  if (shape === "linear_decay") return interval + decay * widenings;
  if (shape === "fixed_interval") return interval;
  if (shape === "every_run") return 1;
  // `initial_then_exponential`, and anything unrecognised, which resolves to the
  // default shape everywhere else too.
  return interval * decay ** widenings;
}
