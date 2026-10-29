// A step that could not find its control where it was saved, though one like
// it is on the page (t420).
//
// Paid run R4a (`run-mv2nlh9l-52e476da`, step 0038): the single trial stopped
// at a typing step with `web.target.not_found`, because the address the step
// was saved with quoted an id the page mints again on every load. The control
// itself was on the page: the domain weighed the same-family controls there and
// the closest matched the saved one far better than the rest, just short of a
// sure match. The feedback said only "The step's control was not found on the
// page", quoted the stale address, and marked it retryable. The model read
// that as "my handle is stale", never tested again, and spent 15 decisions
// looking for a new handle and repeating acts on the same control until the
// repeat guard ended the build.
//
// So when a trial step fails to find its target and the domain's measurement
// says the control is very likely still there, the step says so plainly, says
// that nothing in the script needs to change for it, and marks it retryable:
// the trial gate (`../../flow-bootstrap/candidate/trial-gate.ts`) reads
// `targetOnPage` to tell the model to test the same revision again, and, if it
// fails the same way twice, to give the step another way to find its control.
//
// **Where the measurement is read.** The web domain puts its target
// resolution beside the action result it returns (`resolution`: a closed
// strategy word and numbers, nothing from the page), which a failed attempt
// keeps as `outputs.result.result.resolution`, as `./check-step.ts` reads its
// text sighting. `candidateCount` is how many controls of the same family the
// page held, `bestScore` and `runnerUpScore` how well the closest two matched
// the saved control, on Core's scale from -1 (contradicted) to 1 (the same).
// Anything that is not exactly that shape is ignored, and the step keeps
// today's feedback.
//
// **What counts as on the page.** The closest control must match the saved one
// at `NEAR_MISS_MIN_SCORE` or better, and lead the runner-up, when there is
// one, by `NEAR_MISS_MIN_LEAD`. The domain's scoring notes put the controls it
// recovered after their address drifted at 0.149 to 0.27 (R4a's), and the
// different controls that merely resembled a saved one at 0.010 and 0.088; the
// bar sits between. A wrong call costs one more trial, which the gate bounds:
// the same failure at the same step twice closes the revision to re-testing.
//
// **What the model reads (t426).** Only that the step could not find its
// control where it was saved, though one like it is on the page, and to test
// the step unchanged. The measurement decides; it is never said: no score, no
// count of look-alikes, and no word for how a control is found. Finding a saved
// control is the extension's work (user, 2026-10-10), and R4a's wording ("the
// address is out of date", "matched the saved one at 0.27") sent the model
// looking for a new handle.
//
// **A control on the page but not shown is not a near miss (t661).** A8 bigbox
// cart (`run-mvac0ddx-f52ba929`): the step's control was found -- one match,
// scored well -- but its menu had been closed again, so it had no box. That
// measurement cleared the bar above, and the model was told the step "could not
// find its control ... The step itself is right ... test again", and spent
// trials re-addressing a control it never lost. Where the domain measured the
// control on the page but not shown (`shown: false`, read by
// `../../executor/state-routing/target-not-shown.ts`), the step now says that,
// says a step before it must show it, carries `targetNotShown` rather than
// `targetOnPage`, and is never told to test unchanged. A domain that does not
// report it leaves the step as it was.
//
// **A control that belongs to another row is not a near miss (t792).** A repeat
// pass's press whose saved control the page answered with another row's copy
// of it (every row of an order table holds the same "Cancel" button): the
// client refuses that match and says so on the resolution as one closed word,
// `refusedBecause: "other-record"`. The measurement beside it then scores the
// other rows' look-alikes, well, and the step read as "could not find its
// control ... The step itself is right ... test again" -- the opposite of the
// truth: the step's target is a control of the wrong row, and testing it again
// meets the same row. The refusal is read before the scores and decides alone:
// the step says its target matched another row's control and that a step
// inside a repeat must name each pass's own row's control, from the row's value
// or from a control inside what the pass opened; it carries `targetOtherRecord`
// rather than `targetOnPage`, is not retryable, and is never told to test
// unchanged.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioTargetMeasuredNotShown } from "../../executor/state-routing/index.ts";

/** The lowest score at which the closest control is read as the saved one, still on the page (header). */
const NEAR_MISS_MIN_SCORE = 0.12;

/** How far the closest control must lead the runner-up for it to be one control, not one of several alike (header). */
const NEAR_MISS_MIN_LEAD = 0.1;

/** The most of a step's own label quoted back. */
const LABEL_MAX_CHARS = 80;

/** What the model is told to do about it on the step itself; the trial gate says the same as its instruction. */
const ADVICE = "Nothing in your script needs to change for this: test this same revision again, unchanged, without acting on the control yourself.";

/** What happened, in the words every try of such a step says it (`./absorbed.ts` says the same). */
const ON_PAGE_HAPPENED = "The step could not find its control where it was saved, though one like it is on the page.";

/** What happened to a step whose control was on the page but not shown (header, t661; `./absorbed.ts` says the same). */
const NOT_SHOWN_HAPPENED = "The step found its control on the page, but the control was not shown, so it could not be used.";

/** What the model is told to do about it on the step itself; the trial gate says the same as its instruction (header, t661). */
const NOT_SHOWN_ADVICE = "Testing this revision unchanged would meet the same hidden control. A step before this one must show it: the step that opens the menu, panel or list holding it must run right before this step, with nothing between them that could close it again. Change the steps that lead to this one, not how this step finds its control.";

/** What happened to a step whose control matched another row's (header, t792; `./absorbed.ts` says the same). */
const OTHER_RECORD_HAPPENED = "The step's target matched another row's control, not the control of the row this pass is on.";

/** What the model is told to do about it on the step itself (header, t792). */
const OTHER_RECORD_ADVICE = "Testing this revision unchanged would meet the same other row's control. A step inside a repeat must name each pass's own row's control: take it from the row's value, or use a control inside what the pass opened. Change how this step names its control, not the steps before it.";

/**
 * The fields a step that could not find a control still on the page adds to its
 * feedback entry, replacing what it says happened; nothing for any other step.
 * A control measured on the page but not shown says that instead
 * (`targetNotShown`, header, t661). `step` is the step's number in the
 * feedback, `control` its control's words.
 */
export function automationStudioTrialTargetOnPage(input: {
  step: number;
  node: AutomationStudioFlowNode | undefined;
  control: string | undefined;
  attempt: AutomationStudioNodeAttemptTrace;
  /** The step's earlier failed attempts, latest last: read when the final one carries no measurement. */
  earlier?: readonly AutomationStudioNodeAttemptTrace[] | undefined;
}): JsonObject | undefined {
  const { attempt } = input;
  if (attempt.status !== "failed" || attempt.failure?.category !== "target_not_found") return undefined;
  const tried = [attempt, ...[...(input.earlier ?? [])].reverse()].filter((each) => each.failure?.category === "target_not_found");
  const label = bounded(input.node?.label);
  const named = `Step ${input.step}${label ? ` (${JSON.stringify(label)})` : ""}`;
  const control = input.control ? ` ${JSON.stringify(input.control)}` : "";
  // The latest try that measured anything decides: one that found the control hidden is never a near miss (header, t661).
  const latest = tried.find((each) => automationStudioTargetMeasuredNotShown(each) || refusedAsOtherRecord(each) || measurement(each) !== undefined);
  if (latest && !automationStudioTargetMeasuredNotShown(latest) && refusedAsOtherRecord(latest)) {
    return {
      happened: OTHER_RECORD_HAPPENED,
      targetOtherRecord: true,
      otherRecord: `${named} matched another row's control${control}, not the control of the row this pass is on.`,
      advice: OTHER_RECORD_ADVICE,
      retryable: false
    };
  }
  if (latest && automationStudioTargetMeasuredNotShown(latest)) {
    return {
      happened: NOT_SHOWN_HAPPENED,
      targetNotShown: true,
      notShown: `${named} found its control${control} on the page, but it was not shown, so the step could not use it. The step's control is right; a step before it must show it.`,
      advice: NOT_SHOWN_ADVICE,
      retryable: false
    };
  }
  const measured = latest ? measurement(latest) : undefined;
  if (!measured || !onPage(measured)) return undefined;
  return {
    happened: ON_PAGE_HAPPENED,
    targetOnPage: true,
    onPage: `${named} could not find its control${control} where it was saved, though one like it is on the page. The step itself is right.`,
    advice: ADVICE,
    retryable: true
  };
}

/** Whether the client refused the attempt's match as another row's control (header, t792). */
function refusedAsOtherRecord(attempt: AutomationStudioNodeAttemptTrace): boolean {
  return objectAt(attempt.outputs, "result", "result", "resolution")?.refusedBecause === "other-record";
}

type Measurement = { candidateCount: number; bestScore: number; runnerUpScore?: number };

/** The domain's target resolution on the action result a failed attempt kept, when it is exactly the shape the domain states. */
function measurement(attempt: AutomationStudioNodeAttemptTrace): Measurement | undefined {
  const resolution = objectAt(attempt.outputs, "result", "result", "resolution");
  if (!resolution) return undefined;
  const { candidateCount, bestScore, runnerUpScore } = resolution;
  if (typeof candidateCount !== "number" || !Number.isSafeInteger(candidateCount) || candidateCount < 1 || !score(bestScore)) return undefined;
  return { candidateCount, bestScore, ...(score(runnerUpScore) ? { runnerUpScore } : {}) };
}

function onPage(measured: Measurement): boolean {
  if (measured.bestScore < NEAR_MISS_MIN_SCORE) return false;
  return measured.runnerUpScore === undefined || measured.bestScore - measured.runnerUpScore >= NEAR_MISS_MIN_LEAD;
}

function score(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
}

function objectAt(value: unknown, ...path: string[]): Readonly<Record<string, unknown>> | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current && typeof current === "object" && !Array.isArray(current) ? current as Readonly<Record<string, unknown>> : undefined;
}

/** One line, whitespace collapsed, at most `LABEL_MAX_CHARS`; nothing for an empty or absent text. */
function bounded(text: string | undefined): string | undefined {
  const line = text?.replace(/\s+/gu, " ").trim();
  return line ? line.slice(0, LABEL_MAX_CHARS) : undefined;
}
