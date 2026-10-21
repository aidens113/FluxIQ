// What Core's own record says of a build's tests, for its ending (t738).
//
// Everything-store `run-mvgf04kw-310fc169` ended on the supervisor's own
// account -- "the part that reaches checkout never passed its own test" --
// while Core held the facts: that part's trial was judged yes, and the judged
// whole run did every act and was judged no because nothing it read was stored.
// An ending now says those facts in Core's words beside the model's checked
// reason (`./reason-checked.ts`, `../project-build/run.ts`): how many parts were tested on
// their own and how many passed, how often each other one was tried and what
// its last test answered, and what the judged run of the whole Flow did --
// how many of its steps ran and how many rows it stored -- and what it was
// judged. Counts and verdicts only, never a part's name, a page's words or the
// judge's own text. Every part tried counts, whichever plan it was tried under:
// a part a later plan replaced still passed or failed its own test.
//
// **An earlier version's whole test still counts (t753).** Round 5 said "A
// whole Flow was assembled and never tested from its start" and "It was never
// test-run from the start" of a build whose Flow had been test-run whole
// twice: it was assembled again after those runs, and its latest version had
// no test of its own. Where the latest version has none, the whole runs of
// every version (`wholeRuns`, the build's trial records) are said: how many
// there were, what the last of them was judged, and that the latest version
// was not tested.

import type { AutomationStudioActivityTimeLimitTried } from "../../activity/index.ts";
import type { AutomationStudioCandidateTrialResult, AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";

/** A test's last verdict, in words that finish "whose last test ...". */
const LAST_TEST: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "passed",
  no: "was judged not to do what was asked",
  unsure: "could not be confirmed",
  not_judged: "could not be confirmed",
  execution_failed: "did not run to its end"
});

/** A judged run's verdict, in words that finish "the judged test run ... ". */
const JUDGED: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "was judged to do what was asked",
  no: "was judged not to do what was asked",
  unsure: "could not be confirmed to do what was asked",
  not_judged: "could not be confirmed to do what was asked",
  execution_failed: "did not run to its end"
});

/** The judged run of the whole Flow, as Core keeps it. */
type Whole = Pick<AutomationStudioCandidateTrialResult, "verdict" | "feedback">;
/** Every whole run of the Flow from its start, of whichever version: how many, and the last one's verdict (header, t753). */
type WholeRuns = { count: number; last: AutomationStudioCandidateTrialVerdict };

/**
 * Core's account of what was tested (header), or undefined when nothing was:
 * `parts` every part's trials by its key, `assembled` whether a whole Flow was
 * put together, `whole` its judged run from its start, when one finished,
 * and `wholeRuns` the whole runs of every version, said where `whole` is
 * absent (header, t753).
 */
export function automationStudioProjectBuildRecordTold(input: {
  parts: ReadonlyMap<string, AutomationStudioActivityTimeLimitTried>;
  assembled: boolean;
  whole?: Whole | undefined;
  wholeRuns?: WholeRuns | undefined;
}): string | undefined {
  const { parts, assembled, whole, wholeRuns } = input;
  const runs = wholeRuns && Number.isSafeInteger(wholeRuns.count) && wholeRuns.count > 0 ? wholeRuns : undefined;
  if (!parts.size && !assembled && !whole && !runs) return undefined;
  return [partsSaid(parts), wholeSaid(assembled, whole, runs)].join(" ");
}

/** How the parts tested on their own came out (header). */
function partsSaid(parts: ReadonlyMap<string, AutomationStudioActivityTimeLimitTried>): string {
  const tried = [...parts.values()];
  const only = tried[0];
  if (!only) return "No part of the Flow was tested on its own.";
  if (tried.length === 1) {
    return only.passed
      ? "The one part tested on its own passed its own test."
      : `The one part tested on its own did not pass its own test: it was tested ${times(only.count)}, and its last test ${LAST_TEST[only.last]}.`;
  }
  const passed = tried.filter((part) => part.passed).length;
  if (passed === tried.length) return `${tried.length === 2 ? "Both" : `All ${tried.length}`} parts tested on their own passed their own test.`;
  const left = tried.filter((part) => !part.passed).map((part) => `a part tested ${times(part.count)} whose last test ${LAST_TEST[part.last]}`);
  const opening = `Of the ${tried.length} parts tested on their own, ${passed === 0 ? "none" : passed} passed ${passed === 1 ? "its" : "their"} own test`;
  return left.length ? `${opening}; left: ${joinedList(left)}.` : `${opening}.`;
}

/** What became of the whole Flow, and what its judged run did and was judged (header). */
function wholeSaid(assembled: boolean, whole: Whole | undefined, runs: WholeRuns | undefined): string {
  // An earlier version's whole runs, where the latest has none of its own (header, t753).
  if (!whole && runs) {
    return `A version of the whole Flow was test-run from its start ${times(runs.count)}, and ${runs.count === 1 ? "that run" : "the last of those runs"} ${JUDGED[runs.last]}; ${assembled ? "the latest version was not tested from its start" : "no current version was assembled to test"}.`;
  }
  if (!whole) return assembled ? "A whole Flow was assembled and never tested from its start." : "No whole Flow was assembled, so it was never tested as one.";
  const did = ran(whole.feedback);
  return `The judged test run of the whole Flow from its start ${did ? `${did}, and ` : ""}${JUDGED[whole.verdict]}.`;
}

/** What the judged run did, from its own feedback: how many of its steps ran, and how many rows it stored; empty when it says neither. */
function ran(feedback: unknown): string {
  const record = feedback && typeof feedback === "object" ? feedback as { steps?: unknown; stored?: unknown } : {};
  const steps = Array.isArray(record.steps) ? record.steps.map((step: unknown) => (step && typeof step === "object" ? (step as { status?: unknown }).status : undefined)) : [];
  const rows = record.stored && typeof record.stored === "object" ? (record.stored as { rows?: unknown }).rows : undefined;
  const said: string[] = [];
  if (steps.length) {
    const succeeded = steps.filter((status) => status === "succeeded").length;
    said.push(succeeded === steps.length ? (steps.length === 1 ? "ran its one step" : steps.length === 2 ? "ran both of its steps" : `ran all ${steps.length} of its steps`) : `ran ${succeeded} of its ${steps.length} steps`);
  }
  if (typeof rows === "number" && Number.isInteger(rows) && rows >= 0) said.push(rows === 0 ? "stored no rows" : `stored ${rows} ${rows === 1 ? "row" : "rows"}`);
  return said.join(" and ");
}

function times(count: number): string {
  return count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
}

function joinedList(items: readonly string[]): string {
  return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
}
