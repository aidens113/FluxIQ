// Where an act's own control stands per one read of it (L1 reset settlement;
// t772, rerun round 6 debug `run-mvrj7qgf-a44a1427`, cause 1): the one answer
// both the undo admission (`../site-reset/undo-admission.ts`, `already_back`)
// and the settlement (`./control-tracker.ts`, `./judge.ts`) read, so an
// admission answering "already back" and a settlement answering "press it
// back" can never both hold for the same read.
//
// An act's own control is the toggle its own press made (`./toggle-witness.ts`):
// one control at its place, from the state the build found (`from`) to the
// state the act set (`to`). A read of it is either one control's own state, as
// a call's declaration reports it, or a page read's counts of each state at a
// place, judged against the counts the build found there (`found`): only the
// toggle's own two states, since a place may hold other controls whose counts
// differ by view.
//
// - `elsewhere`: the read is of another place: it says nothing of this act.
// - `back`: the control shows the state the build found.
// - `set`: it still shows the state the act set.
// - `other`: neither (a third state, or counts that moved some other way).
//
// Pure; opaque tokens and counts only.

type Counts = Readonly<Record<string, number>>;

/** An act's own control: its place, the state the build found it in and the state the act set. */
export type AutomationStudioSiteResetOwnControl = { place: string; from: string; to: string };

/** One read of a control: its own state as a call declares it, or a page read's counts at a place with the counts the build found there. */
export type AutomationStudioSiteResetOwnControlRead =
  | { place: string | undefined; state: string | undefined }
  | { place: string; counts: Counts; found: Counts };

/** Where the act's own control stands per the read (header). */
export type AutomationStudioSiteResetOwnControlStanding = "elsewhere" | "back" | "set" | "other";

export function automationStudioSiteResetOwnControlStanding(own: AutomationStudioSiteResetOwnControl, read: AutomationStudioSiteResetOwnControlRead): AutomationStudioSiteResetOwnControlStanding {
  if (read.place !== own.place) return "elsewhere";
  if ("state" in read) return read.state === own.from ? "back" : read.state === own.to ? "set" : "other";
  const now = (state: string) => read.counts[state] ?? 0;
  const found = (state: string) => read.found[state] ?? 0;
  if (now(own.from) === found(own.from) && now(own.to) === found(own.to)) return "back";
  return now(own.to) > found(own.to) && now(own.from) < found(own.from) ? "set" : "other";
}
