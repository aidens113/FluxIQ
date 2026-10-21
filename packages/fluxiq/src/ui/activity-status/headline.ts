// The headline a person reads for a unit of work: what it is while it runs,
// and how it ended. It names the work, never the step inside it, so it stays
// put while Core's sentences change underneath (the detail line carries those).
//
// Three situations change it besides the work settling (U8 and U9 of the t174
// live lane's UI review):
//
// - **Repair.** Once Core starts repairing the Flow -- a run working out a fix
//   for a failed step, a build re-authoring an answer its check refuted -- the
//   work reads "Fixing your Flow", not "Building your Flow". A run that only
//   presses a failed step again (the page was busy) is not repairing anything
//   and keeps "Running your Flow" (D12 of the t174 UI review of
//   run-musp8nz1-dbd3905a; the pacer tells the two apart, `run-retry.ts`).
//   A run whose repair ends in failure reads "Couldn't fix your Flow": the run
//   had a Flow, and it could not be fixed. A build that fails reads "Build
//   failed" whether or not it was repairing: its repair re-authors the Flow
//   the build is making, so a creation that ends unfinished had no Flow to fix
//   (t195 live run `run-musp474o-e0ed7432`, 12-failure-scenario). The subject
//   kind is what tells the two apart -- the settling row's own words for the
//   work it ends when they name it, else the event's subject (`ending-kind.ts`:
//   live round 1's run A still ended a creation build on "Couldn't fix your
//   Flow"). Core's activity does not say whether a build creates a Flow or
//   extends one, so an extending build that fails reads "Build failed" too,
//   and a creation build re-authoring its first Flow after its test was
//   refuted reads "Fixing your Flow": nothing Core sends tells the two apart.
// - **A check only the person can answer.** When a page action reports that
//   the page asks for what only a person can give (a robot check, a code
//   prompt), the headline says so plainly, in the host's words (`host-words.ts`;
//   the extension says "Waiting for you: finish the check on the page").
// - **A question.** Core's own waiting state (`waiting_permission`, a run
//   paused on an ask) reads as the host words it: the extension says "Waiting
//   for you: answer in the FluxIQ panel", Core's web panel, which is that
//   panel, says "Waiting for your answer".
// - **A pause.** A run Core holds between steps -- the person pressed Take
//   over, or the run was paused -- reads "Paused: your turn on the page". It
//   is a wait on the person, so it shows at once and never fades, and it
//   clears when Core says the run continues ("Continuing from step N") or the
//   run ends.
// - **A test.** While a candidate build test-runs the Flow it submitted, once
//   from its start (`candidate-trial.ts`), the work reads "Testing your Flow",
//   whatever its run reports: a trial repairs nothing, so a step that fails in
//   it is never "Fixing your Flow" (lane A round 4, `run-muyrpbnk-fef374e7`).
// - **Getting the page ready.** While Core runs the parts before a part once
//   to put the page where that part begins (`steady/page-preparation.ts`), the
//   work reads "Getting the page ready": it is neither a test nor a repair
//   (t753: a setup rerun read "Testing your Flow").
// - **Putting the site back.** While a project build's reset brief undoes what
//   the build did on the site, the work reads "Putting the site back", never
//   "Fixing your Flow" (t753: a repair's headline stayed up through a reset).

import type { ActivityDisplay } from "./activity-display.ts";
import type { ActivityHostWords } from "./host-words.ts";
import { ACTIVITY_PAGE_PREPARATION_WORDS } from "./steady/index.ts";

/** What the person is being waited on for. */
export type ActivityWaitReason = "answer" | "check" | "paused";

export type ActivityHeadlineSituation = {
  /** A terminal cancellation reported by Core. */
  readonly stopped?: boolean;
  /** Core is repairing the Flow in this unit of work. */
  readonly repairing?: boolean;
  /** A candidate build is test-running the Flow it submitted; outweighs `repairing`. */
  readonly testing?: boolean;
  /** Core is running the parts before a part only to get the page ready for it; outweighs the rest of the work. */
  readonly preparing?: boolean;
  /** A project build's reset brief is putting the site back; outweighs `repairing`. */
  readonly resetting?: boolean;
  /** Why the work waits, when `outcome` is `waiting`. */
  readonly waitingOn?: ActivityWaitReason;
};

const WORKING: Readonly<Record<ActivityDisplay["subjectKind"], string>> = Object.freeze({
  build: "Building your Flow",
  run: "Running your Flow"
});

const DONE: Readonly<Record<ActivityDisplay["subjectKind"], string>> = Object.freeze({
  build: "Flow ready",
  run: "Run finished"
});

const FAILED: Readonly<Record<ActivityDisplay["subjectKind"], string>> = Object.freeze({
  build: "Build failed",
  run: "Run failed"
});

/** The same in every host; a question or a check is worded by the host (`host-words.ts`). */
const PAUSED = "Paused: your turn on the page";

const REPAIRING = "Fixing your Flow";
const TESTING = "Testing your Flow";
const RESETTING = "Putting the site back";
/** Only a run's failed repair: a build that fails in its repair says the build failed. */
const REPAIR_FAILED = "Couldn't fix your Flow";

/** The headline for a unit of work of `kind`, working (`outcome` null) or settled, in `situation`, a wait said in the host's `words`. */
export function activityHeadline(kind: ActivityDisplay["subjectKind"], outcome: ActivityDisplay["outcome"], words: ActivityHostWords, situation: ActivityHeadlineSituation = {}): string {
  if (outcome === "failed" && situation.stopped) return kind === "build" ? "Build stopped" : "Run stopped";
  if (outcome === "waiting") {
    const reason = situation.waitingOn ?? "answer";
    return reason === "paused" ? PAUSED : words[reason];
  }
  if (outcome === "done") return DONE[kind];
  if (outcome === "failed") return kind === "run" && situation.repairing && !situation.testing ? REPAIR_FAILED : FAILED[kind];
  if (situation.preparing) return ACTIVITY_PAGE_PREPARATION_WORDS;
  if (situation.testing) return TESTING;
  if (situation.resetting) return RESETTING;
  return situation.repairing ? REPAIRING : WORKING[kind];
}
