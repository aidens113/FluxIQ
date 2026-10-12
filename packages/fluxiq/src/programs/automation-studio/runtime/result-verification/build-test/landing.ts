// What a checked step's act did when the build did it, for the judge of the
// build's test: `explored`, with the landing it rests on (t443).
//
// **The failure this closes (live run `run-mv4dgmki-2b13db91`, R4b).** The
// repair's rerun of the Flow's "Add to basket" pressed it once, live, and the
// cart went from 0 to 1. Every later rerun of that step was a check, because
// the act was done (`../../llm/node-tools/rerun-check.ts`), and the check
// overwrote the step's record: `effectApplied: false`, `core.replay.verified`.
// The press survived only in `priorExecution`, which `explored` never read, so
// the judge saw `changed: no` and no evidence anywhere that the Flow's act
// works -- while the build test withholds that act (decision D1,
// `../../flow-draft/verify-only.ts`) and no further press is allowed. Read from
// `priorExecution`, though, the landing would have been credited wrongly: the
// rerun had put the item page back to its defaults and pressed with none of the
// steps before it done again, so the cart held another variant than asked.
//
// **The rule.** The press a checked step's record rests on -- its
// `priorExecution` when a later check replaced the record, else the step's own
// record when a rerun pressed it -- is shown as `landed`, and it counts only
// when it ran after the steps before it, as the step now stands:
//
//   - a rerun put back that did again every proposed step before it, in order
//     (`rerunPlace.redone`, `../../llm/node-tools/step-place.ts`), each still in
//     the Flow; `after` names them with their words, the choices the act was
//     made with. A put-back that left any out -- a page comparison decided where
//     they started -- does not count (t443 review: positive evidence only);
//   - a rerun on the page in the state its step found it (`already_there`),
//     only when no proposed step comes before it;
//   - a press the build made as an ordinary call, after steps that all ran in
//     this build as they now stand (none carried from the earlier Flow and not
//     run, written, or a checked candidate).
//
// A press on a page put back without the steps before it, or wherever the last
// call left the page, or with words other than the step's now, does not count
// and says why. A counted landing gives `explored` its own record -- it changed
// something, under its own code -- and one that does not leaves `explored` as
// the step's record says. Words are the summary's (`targetWords`), so the judge
// reads a landing in the same words as the steps.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepById, automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepCarried, automationStudioFlowDraftStepCarriedJoin } from "../../flow-draft/carried-step/index.ts";
import type { AutomationStudioBuildTestStep } from "../contracts.ts";

type Explored = NonNullable<AutomationStudioBuildTestStep["explored"]>;
type PressRecord = Omit<AutomationStudioFlowDraftStep, "priorExecution" | "checkedCandidate">;

/**
 * What a checked step did while the build explored it, with the landing its
 * act rests on when a rerun or a later check holds one. `steps` is the draft;
 * `wordsOf` gives a step's words as the summary shows them.
 */
export function automationStudioBuildTestExplored(
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[],
  wordsOf: (step: PressRecord) => string[]
): Explored {
  const own = recorded(step);
  const press: PressRecord | undefined = step.priorExecution ?? (step.rerunPlace ? step : undefined);
  if (!press || press.effectApplied !== true) return own;
  const before = proposedBefore(steps, step);
  const pressed = press === step ? undefined : wordsOf(press);
  const now = wordsOf(step);
  const moved = pressed !== undefined && (press.actionId !== step.actionId || !sameWords(pressed, now));
  const order = moved ? { why: "it was done with another target than the step has now" } : orderOf(press, before, steps);
  const landed = "why" in order
    ? { counts: false, ...(moved && pressed?.length ? { pressed } : {}), why: order.why }
    : { counts: true, ...(order.after.length ? { after: order.after.map((each) => ({ step: each.position, ...wordsField(wordsOf(each)) })) } : {}) };
  return { ...(landed.counts ? recorded(press) : own), landed };
}

/** Whether the press ran after the steps before it, and which steps it ran after; else why not. */
function orderOf(press: PressRecord, before: readonly AutomationStudioFlowDraftStep[], steps: readonly AutomationStudioFlowDraftStep[]): { after: AutomationStudioFlowDraftStep[] } | { why: string } {
  const place = press.rerunPlace;
  if (place?.kind === "start_page_unknown") return { why: "it ran wherever the page was left, not after the steps before it" };
  if (place?.kind === "already_there") {
    return before.some((each) => !automationStudioFlowDraftStepCarriedJoin(each)) ? { why: "it ran on the page as it stood, without the steps before it done again first" } : { after: [] };
  }
  if (place?.kind === "put_back") {
    if (place.unknownBefore !== undefined) return { why: `it ran on its page loaded again without step ${place.unknownBefore} and the steps before it done again first` };
    const redone = place.redone.map((id) => automationStudioFlowDraftStepById(steps, id));
    const changed = redone.findIndex((each) => !each || !automationStudioFlowDraftStepIsProposed(each));
    if (changed >= 0) return { why: "a step it ran after has changed since" };
    // Positive evidence only: every step before it done again, never a page comparison that left some out (t443 review).
    const skipped = before.filter((each) => !automationStudioFlowDraftStepCarriedJoin(each) && !place.redone.includes(automationStudioFlowDraftStepId(each)));
    if (skipped.length) return { why: `step${skipped.length > 1 ? "s" : ""} ${skipped.map((each) => each.position).join(", ")} before it ${skipped.length > 1 ? "were" : "was"} not done again first` };
    return { after: redone as AutomationStudioFlowDraftStep[] };
  }
  const unrun = before.filter((each) => automationStudioFlowDraftStepCarried(each) || each.written === true || each.checkedCandidate !== undefined);
  return unrun.length
    ? { why: `step${unrun.length > 1 ? "s" : ""} ${unrun.map((each) => each.position).join(", ")} before it had not run in this build as ${unrun.length > 1 ? "they stand" : "it stands"} when it was done` }
    : { after: [] };
}

/** The step's own record of what it did. */
function recorded(step: PressRecord): Explored {
  return {
    changed: step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
    ...(step.resultCode ? { resultCode: step.resultCode } : {}),
    ...(step.stateBefore !== undefined && step.stateAfter !== undefined ? { stateChanged: step.stateBefore !== step.stateAfter } : {})
  };
}

/** The proposed steps before `step` in the draft, in order. */
function proposedBefore(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  const at = steps.indexOf(step);
  return (at >= 0 ? steps.slice(0, at) : steps.filter((each) => each.position < step.position)).filter(automationStudioFlowDraftStepIsProposed);
}

function wordsField(words: string[]): { target?: string[] } {
  return words.length ? { target: words } : {};
}

function sameWords(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((word) => right.includes(word));
}
