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
//
// **Every test refused (t791).** A build whose every asked test was refused before it ran has no tested part and no
// whole run; its record says that plainly with the refusal's reason, not that nothing was tested.

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
  refused?: { count: number; why: readonly string[] } | undefined;
}): string | undefined {
  const { parts, assembled, whole, wholeRuns, refused } = input;
  const runs = wholeRuns && Number.isSafeInteger(wholeRuns.count) && wholeRuns.count > 0 ? wholeRuns : undefined;
  // Every test the build asked was refused before it ran: said plainly, with why (header, t791).
  if (refused && refused.count > 0 && !parts.size && !whole && !runs) return refusedSaid(refused);
  if (!parts.size && !assembled && !whole && !runs) return undefined;
  // The only part tested and the whole run are one test when they ended the same way: said once, with how often it was tried (t774).
  const only = parts.size === 1 ? [...parts.values()][0] : undefined;
  const last = whole ? whole.verdict : runs?.last;
  if (only && last !== undefined && only.last === last) {
    const often = only.count > 1 ? ` It was tried ${times(only.count)}.` : "";
    return `${wholeSaid(assembled, whole, runs)}${often}`;
  }
  return [partsSaid(parts), wholeSaid(assembled, whole, runs)].join(" ");
}

/** That every test the build asked for was refused so none ran, and why in the refusal's own person words (header, t791). */
function refusedSaid(refused: { count: number; why: readonly string[] }): string {
  const opening = refused.count === 1 ? "The one test the build asked for was refused, so no test of the Flow ran" : `All ${refused.count} tests the build asked for were refused, so no test of the Flow ran`;
  const reasons = refused.why.slice(0, 2).map((reason) => reason.replace(/[.\s]+$/u, ""));
  if (!reasons.length) return `${opening}.`;
  return `${opening}: Core would not run ${refused.count === 1 ? "it" : "them"} because ${reasons.join("; and because ")}.`;
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
  const record = feedback && typeof feedback === "object" ? feedback as { steps?: unknown; stepsLeftOut?: unknown; stored?: unknown } : {};
  const listed: unknown[] = Array.isArray(record.steps) ? record.steps : [];
  const statuses = listed.map((step: unknown) => (step && typeof step === "object" ? (step as { status?: unknown }).status : undefined));
  // The listing cuts a long run between its first steps and its last; the cut steps ran too (t774).
  const cut = typeof record.stepsLeftOut === "number" && Number.isSafeInteger(record.stepsLeftOut) && record.stepsLeftOut > 0 ? record.stepsLeftOut : 0;
  // A step that appears again is a repeat's next pass: the count is of every pass, not of the Flow's own steps (the panel counts those).
  const labels = listed.flatMap((step) => (step && typeof step === "object" && typeof (step as { label?: unknown }).label === "string" ? [(step as { label: string }).label] : []));
  const repeats = new Set(labels).size < labels.length;
  const rows = record.stored && typeof record.stored === "object" ? (record.stored as { rows?: unknown }).rows : undefined;
  const said: string[] = [];
  const total = statuses.length + cut;
  if (total) {
    const succeeded = statuses.filter((status) => status === "succeeded").length + cut;
    const counted = repeats ? ", counting each pass of a repeat" : "";
    said.push(succeeded === total ? (total === 1 ? "ran its one step" : total === 2 ? "ran both of its steps" : `ran all ${total} of its steps${counted}`) : `ran ${succeeded} of its ${total} steps${counted}`);
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
