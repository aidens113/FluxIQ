// The step that took a build to where its Flow starts is kept in the Flow,
// whatever the amendments since said about it.
//
// **The failure this closes.** Both bigbox builds of round 1 and round 2
// (`run-mulx76vv-a882551e`, `run-mum0ke7z-940cbd27`) ran the navigation first,
// because from a blank tab the domain lets nothing else run, and had it in the
// draft as step 1. By the time they finished, the kept draft held no step that
// went anywhere, and completion was refused `bootstrap.cannot_reach_start_location`
// (`./check.ts`). A step leaves the Flow three ways, and each is ordinary in a
// long build: `drop`; `exploratory`, which a model reads as "I only did this to
// get there"; and `rerun`, which drops the step it replaces before running it
// again and leaves nothing kept when the new run fails. The refusal was
// correctable, but it cost a turn in each build and came at the end, when the
// budget had none left: round 1 was refused on its only completion and ran out
// two decisions later.
//
// **What this does instead.** At completion, and only there, a draft whose
// kept steps carry nothing about the start location has the earliest withdrawn
// step that does -- one that ran and worked -- put back as its first step, the
// way `keep` puts a step back: in the Flow and unconditional. That is the Flow
// the refusal would have asked the model to write, written without asking.
//
// **Why that is not second-guessing the model.** Arrival is not a choice a
// Flow has. The domain made the build run this step before anything else would
// run, and the finished Flow meets the same rule the first time it runs on its
// own, so a Flow without it cannot take a single step. `exploratory` is "I did
// this to look around"; nothing looks around from a blank tab. What stays the
// model's is everything else: which steps, in what order, on what conditions.
//
// **What it deliberately does not do.** Invent a step: a draft with no
// withdrawn step that went there is left alone, and the check refuses it with
// the start location named, as before. Touch a draft whose kept steps already
// carry the start location, or one with no kept step at all. Weaken the check:
// the plan built from what this returns is checked exactly as any other.
// Change the loop's own draft: the steps come back copied where anything was
// changed, so the draft the model is shown still says what it said.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation as goesThere } from "./step-goes-to-location.ts";

/** A draft as completion should build it, and the step it had to keep, if any. */
export type AutomationStudioFlowBootstrapDraftWithStartStep = {
  /**
   * The same array when nothing changed; otherwise a new one numbered 1..n,
   * holding copies of every step whose place or disposition changed.
   */
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The step put back, by the position and id it had in the draft handed in, and how it had been withdrawn. */
  restored?: { position: number; id?: string; withdrawnAs: "dropped" | "exploratory" | "taken" };
};

/**
 * The draft with its arrival kept, for the completion to assemble the Flow
 * from.
 *
 * `startLocation` absent -- a build handed its target rather than told where
 * it is -- has nothing to arrive at, and the draft comes back as it was.
 */
export function automationStudioFlowBootstrapDraftWithStartStep(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  startLocation?: string | undefined;
}): AutomationStudioFlowBootstrapDraftWithStartStep {
  const unchanged = { steps: input.steps };
  const startLocation = input.startLocation?.trim();
  if (!startLocation) return unchanged;
  const kept = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  if (!kept.length || kept.some((step) => goesThere(step, startLocation))) return unchanged;
  const arrival = input.steps.find((step) =>
    step.disposition !== "kept" && automationStudioFlowDraftStepIsProposable(step) && goesThere(step, startLocation));
  if (!arrival) return unchanged;

  // Put back as `keep` puts a step back, and ahead of every kept step: nothing
  // the Flow does can run before it has arrived.
  const restored: AutomationStudioFlowDraftStep = { ...arrival, disposition: "kept" };
  delete restored.routing;
  const rest = input.steps.filter((step) => step !== arrival);
  const firstKept = rest.findIndex(automationStudioFlowDraftStepIsProposed);
  const ordered = [...rest.slice(0, firstKept), restored, ...rest.slice(firstKept)];
  return {
    steps: ordered.map((step, index) => step.position === index + 1 && step !== restored ? step : { ...step, position: index + 1 }),
    restored: { position: arrival.position, ...(arrival.id === undefined ? {} : { id: arrival.id }), withdrawnAs: arrival.disposition === "dropped" || arrival.disposition === "taken" ? arrival.disposition : "exploratory" }
  };
}
