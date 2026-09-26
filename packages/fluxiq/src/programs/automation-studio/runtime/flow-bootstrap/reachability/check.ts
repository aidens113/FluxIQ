// The check a build's completed plan passes before it may be proposed: can this
// Flow reach the place it was told to start?
//
// **What it catches.** `run-muht9lpw-a39aa056` built a Flow of one node -- a
// list extraction, with no navigation anywhere in it -- and replay failed
// before its first step: `Cannot access contents of url "about:blank"`. The
// exploration had done the work: it navigated, dismissed the page's
// interruptions and read the list, and then amendments reduced the draft to the
// reading alone. Every completion check passed it, because every one of them
// asks whether the Flow could *answer* and none asked whether it could *run*.
// An extraction on its own answers a request for rows; it just has nowhere to
// do it.
//
// **What it deliberately does not catch.** Not a route, an order or a
// technique: how a Flow gets to where it starts is the domain's business and
// the model's, and a step counts as going there on a loose reading of the value
// it was written with (`./plan-locations.ts`). Not a Flow with no start
// location, because a build handed its target begins already there and there is
// nothing to reach. Not a Flow of Core nodes, which touch no target at all. Not
// a Flow that goes to the wrong place, which is the run's to discover. The line
// is arrival -- a Flow whose steps all act on something no step of it opened.
//
// **A refusal the build cannot act on is not made.** A bound domain that
// registers nothing which can be told a destination cannot reach a start
// location however the Flow is written, so the library is asked first
// (`./library-locations.ts`) and such a build is left where it stood. That is
// what keeps a refusal correctable, which is the difference between one more
// decision and a rewrite loop ending at the no-progress guard. Where a refusal
// is made it is correctable by construction: the build's own steps acted on the
// target, so the domain let it act, so it had already got there -- and the step
// that took it there is one it ran.
//
// **What a refusal costs.** No provider call, on any path. A build whose Flow
// can reach its start pays one plan walk and, at most, one walk of the node
// library.
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapReachability } from "./contracts.ts";
import { automationStudioFlowBootstrapLibraryTakesALocation } from "./library-locations.ts";
import { automationStudioFlowBootstrapPlanLocations } from "./plan-locations.ts";

/** Steps named in the feedback. A plan holds at most sixteen per subflow. */
const MAX_FEEDBACK_STEPS = 24;

/**
 * What the model is told to do, which matters as much as the refusal.
 *
 * It names the start location, which is the only thing that makes it
 * actionable, and it says where the step belongs: the step that goes there is
 * the Flow's own first step, because a Flow is built from the steps that ran
 * and that is the step the domain made the build run first.
 */
const CANNOT_REACH_INSTRUCTION = "Nothing was created and this build is still open, so correct it rather than finishing again unchanged. "
  + "cannotReach.starts is where this Flow has to begin, and cannotReach.steps are the steps you have -- none of them goes there. "
  + "Run the node from your node library that goes to cannotReach.starts, keep it in the draft as the first step, and finish again. "
  + "It is the same step you had to run before anything else would run for you, and the Flow meets that rule again the first time it runs on its own: "
  + "a Flow that begins by acting on a target no step of it opened cannot take a single step.";

export function checkAutomationStudioFlowBootstrapReachesStartLocation(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /**
   * Where the Flow starts, as the build was told it (`../start-location.ts`).
   *
   * Absent -- a build handed its target rather than told where it is -- leaves
   * the check with nothing to hold the Flow to, and it passes: a plan is never
   * refused for an arrival nobody asked for. Core bounds the value's length at
   * the door, so it travels into the feedback as it is.
   */
  startLocation?: string | undefined;
}): AutomationStudioFlowBootstrapReachability {
  const startLocation = input.startLocation?.trim();
  if (!startLocation) return { ok: true };
  if (!automationStudioFlowBootstrapLibraryTakesALocation(input)) return { ok: true };
  const found = automationStudioFlowBootstrapPlanLocations({ ...input, startLocation });
  if (!found.acting.length || found.reaching.length > 0) return { ok: true };
  return {
    ok: false,
    issue: {
      severity: "error",
      code: "bootstrap.cannot_reach_start_location",
      // Core's own sentence, quoting nothing, which is what lets the feedback
      // carry it (`../plan/issue-feedback.ts`).
      message: "This Flow acts on the target it was told to start at and no step of it goes there, so no run of it could take its first step.",
      path: "plan.subflows"
    },
    cannotReach: {
      starts: startLocation,
      lacks: "no step of this Flow goes to where it starts",
      steps: found.steps.slice(0, MAX_FEEDBACK_STEPS),
      // Said rather than hidden: a longer Flow is shown its first steps only.
      ...(found.steps.length > MAX_FEEDBACK_STEPS ? { stepsWithheld: true } : {})
    },
    instruction: CANNOT_REACH_INSTRUCTION
  };
}
