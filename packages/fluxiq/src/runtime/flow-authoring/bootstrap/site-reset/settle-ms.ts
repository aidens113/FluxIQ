// How far apart the reset's two reads of an untouched page are (t475,
// `./start-check.ts`): long enough that content changing by itself -- a
// rotating banner, a ticking count -- is seen to change, and short enough
// that a build making a few lasting acts barely notices it.

/** Milliseconds between the two reads of a settled read. */
export const AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS = 1_000;
