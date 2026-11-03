// Where an act's own control is, and where it stands per one read of it (L1
// reset settlement; t772, rerun round 6 debug `run-mvrj7qgf-a44a1427`, cause 1;
// t797 P4 item 1): the one answer both the undo admission
// (`../reset-undo/admission.ts`, `own`, `already_back`, its value undo) and the
// settlement (`./control-tracker.ts`, `./judge.ts`) read, so an admission
// answering "already back" and a settlement answering "press it back" can never
// both hold for the same read.
//
// **One place per act (t797).** An act's own control has one place, and every
// reader takes it from `automationStudioSiteResetActOwnControl`: the place its
// retained original was read at (`controlOriginal`, a trial step's stamp, with
// the counts the build found there), else its toggle's, else its own press's,
// else its spot's (a value act's own control, `../reset-undo/admission.ts`). In
// rerun round 6 the original sat at one place and the toggle at another, so the
// settlement judged one control and the admission another, for 110 steps. Now a
// press read at another place than the act's own is never its toggle
// (`./judge.ts`, `toggleOf`), and the toggle the admission is handed is always at
// the act's own place.
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

/**
 * Where an act's own control is (header, t797): its one place, the page and resource it was read on, the location it is
 * judged at only (`at`, a looped pass's own item where items share place tokens), and the counts the build found there
 * where a retained original says (`found`).
 */
export type AutomationStudioSiteResetOwnPlace = { place: string; page?: string | undefined; resource?: string | undefined; at?: string | undefined; found?: Counts | undefined };

/** What the one place is read off: the act's retained original, its toggle, its own press and its spot (header). */
type PlacedAct = {
  controlOriginal?: { resource: string; page: string; place: string; before: Counts; at?: string | undefined } | undefined;
  toggle?: { page: string; place: string } | undefined;
  press?: { page: string; place: string } | undefined;
  spot?: { place?: string | undefined; resource?: string | undefined } | undefined;
};

/** The act's own control's one place (header): its original's, else its toggle's, else its press's, else its spot's; none where it has none. */
export function automationStudioSiteResetActOwnControl(act: PlacedAct): AutomationStudioSiteResetOwnPlace | undefined {
  const original = act.controlOriginal;
  if (original) return { place: original.place, page: original.page, resource: original.resource, ...(original.at !== undefined ? { at: original.at } : {}), found: original.before };
  const pressed = act.toggle ?? act.press;
  if (pressed) return { place: pressed.place, page: pressed.page, ...(act.spot?.resource !== undefined ? { resource: act.spot.resource } : {}) };
  return act.spot?.place !== undefined ? { place: act.spot.place, ...(act.spot.resource !== undefined ? { resource: act.spot.resource } : {}) } : undefined;
}

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
