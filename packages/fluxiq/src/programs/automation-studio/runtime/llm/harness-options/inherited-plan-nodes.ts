// Which nodes of a plan built from a draft are the Flow's own, carried over as
// they stand.
//
// **The failure this answers.** A run whose answer was refuted is re-authored
// from the Flow it ran, read back as a draft (`../node-tools/draft-from-flow.ts`),
// and that seed deliberately carries no consequence declaration: Core does not
// say "this causes nothing lasting" on the model's behalf for a node it never
// authored. The web domain, rightly, refuses any press that declared nothing
// (`web.step.consequences_undeclared`). So every press the Flow already had --
// a cookie banner's Accept, a search box's Go -- was refused on every
// completion of `run-munnhi5q-4867dabe`'s re-author, eight times, until the
// build stopped. The model had not written those steps, was not told how a
// seeded step could declare anything, and was answered with plan paths rather
// than the draft steps it can amend. Nothing it could do would get the repair
// of a read-only extraction Flow past a gate on steps it had not touched.
//
// **What an inherited step is, and why it is not asked again.** A node the Flow
// already contains, carried over with nothing about it changed, is not a step
// this build is adding: the Flow runs it every time already, and it entered the
// Flow through the build or the person that put it there. Asking again gates
// nothing new. Any change makes it the build's own step again -- a rerun
// appends a new step that declares, as every run of a node must
// (`../node-tools/run-node.ts`), and settings amended onto a seeded step change
// what it does -- and then it is gated exactly like any other. So the
// risk-only rule stands for every step the build writes: a press that would
// move money, delete, or send or publish still has to say so, and still needs
// the person's permission.
//
// **How a step is known to be inherited, from the step alone.** The seed writes
// it at iteration 0, through the library verb, with no call behind it, nothing
// it ran with, no settings and no declaration. The loop appends every step it
// takes with a call id and a `d<n>` id of its own (`../evidence-loop.ts`), and
// the model cannot write a step any other way, so no step the build took can
// look like this.

import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepId } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "../node-tools/index.ts";
import { AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY } from "./plan-step-consequences.ts";

/**
 * The refs, `<subflow key>.<node key>`, of the plan's nodes that are steps the
 * Flow already contained and the build left exactly as they were.
 *
 * `draftStepIdByNodeKey` is the assembler's account of which draft step each
 * node was written from (`flow-bootstrap/authoring/assemble-draft.ts`); a node
 * it does not name is never inherited.
 */
export function automationStudioInheritedPlanNodeRefs(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  steps: readonly AutomationStudioFlowDraftStep[];
  draftStepIdByNodeKey: Readonly<Record<string, string>>;
}): Set<string> {
  const subflow = input.plan.subflows[0];
  const refs = new Set<string>();
  if (!subflow) return refs;
  const byId = new Map(input.steps.map((step) => [automationStudioFlowDraftStepId(step), step] as const));
  for (const [key, stepId] of Object.entries(input.draftStepIdByNodeKey)) {
    const step = byId.get(stepId);
    if (step && inheritedAsItStands(step)) refs.add(`${subflow.key}.${key}`);
  }
  return refs;
}

/** Whether this step is one the seed wrote and nothing has changed since. */
function inheritedAsItStands(step: AutomationStudioFlowDraftStep): boolean {
  return step.iteration === 0
    && step.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID
    && step.callId === undefined
    && step.ranWith === undefined
    && step.settings === undefined
    && !Object.hasOwn(step.input, AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY);
}
