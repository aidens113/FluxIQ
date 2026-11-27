// Which step of a saved Flow each call of the attempt became, for the act record (t1075 B).
//
// **Why.** A real run refuses a step whose act already landed by finding that act again: by identity, the best reading of
// the step's parameters (`runtime/answer-first/act-record/identity/target-keys.ts`), or by the step's own name. Until now
// only a trial's acts and a run's own acts were known by a step's name (`act-record/mergers/from/`), so an act an
// exploration made by hand was found again only by its parameters. In `run-mwynbry2-f3c88dc7` the assembly wrote one more
// parameter onto the saved "+ Add" (`requiresChosen`), its keys stopped matching the press attempt 1 had landed, and
// attempt 2's replay pressed it a second time. The draft knows which call made each step (`callId`), and the act record
// knows which act each call made, so the act is named by the step it became as the Flow is saved, and the carry no longer
// rests on the parameters keeping their shape.
//
// **What it names.** `step:<plan key>`, the name the run gate reads off a node (`./run-gate.ts`, `stepNames`), as the
// trial-ledger merger names a trial's act (`act-record/mergers/from/trial-ledger.ts`). Only the node that is the step
// itself (a node of the step's own action), never one its statement made beside it (a merge after an optional step). A
// step inside a repeat names nothing: each pass presses its own row, and a name would refuse every pass for one.
//
// **Which call.** A call id is the model's own word, and a step an earlier attempt kept keeps the id its call had then.
// So beside the id each stamp carries what the step says its call was sent and ran with (`forms`), read as the act gate
// reads a call (`act-record/gate/read-call.ts`): the record names an act only where the act answers to one of them
// (`act-record/call-acts.ts`).
//
// Nothing here reads a page or calls a provider: it is the assembled plan, its locator and the draft.

import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioFlowDraftStepById, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAttemptActCallRead, type AutomationStudioAttemptActStepStamp as Stamp } from "../../../../../runtime/answer-first/act-record/index.ts";

/** What the run gate prefixes a plan key with (`./run-gate.ts`, `stepNames`). */
const STEP_NAME_PREFIX = "step:";

/** For each node of `buildPlan` that is a draft step a call made, outside every repeat, that call and the step's name (header). */
export function automationStudioAnswerFirstRunActStepStamps(input: {
  buildPlan: AutomationStudioFlowBuildPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
  steps: readonly AutomationStudioFlowDraftStep[];
}): Stamp[] {
  const repeated = repeatedSteps(input.steps);
  const stamps: Stamp[] = [];
  for (const [subflowIndex, subflow] of input.buildPlan.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const place = input.locator?.nodes[`${subflowIndex}.${nodeIndex}`];
      if (place === undefined || (place.draftStep === undefined && place.draftStepId === undefined)) continue;
      const step = input.steps.find((each) => (place.draftStepId !== undefined ? each.id === place.draftStepId : each.position === place.draftStep));
      if (step?.callId === undefined || step.actionId !== node.definitionId || repeated.has(step)) continue;
      stamps.push({ callId: step.callId, step: `${STEP_NAME_PREFIX}${node.key}`, forms: formsOf(step) });
    }
  }
  return stamps;
}

/** What the step's call was sent and ran with, each read as the act gate reads a call (header). */
function formsOf(step: AutomationStudioFlowDraftStep): Array<Stamp["forms"][number]> {
  return [step.input, ...(step.ranWith ? [step.ranWith] : [])].flatMap((value) => {
    const read = automationStudioAttemptActCallRead({ toolId: step.toolId ?? step.actionId, value });
    return read.kind === "act" ? [{ actionId: read.act.actionId, parameters: read.act.parameters }] : [];
  });
}

/** Every step inside a repeat's span: from the step carrying the repeat through the step it names (header). */
function repeatedSteps(steps: readonly AutomationStudioFlowDraftStep[]): Set<AutomationStudioFlowDraftStep> {
  const inside = new Set<AutomationStudioFlowDraftStep>();
  for (const step of steps) {
    if (step.routing?.kind !== "repeat") continue;
    const last = automationStudioFlowDraftStepById(steps, step.routing.through);
    const from = step.position;
    const to = last?.position ?? Number.POSITIVE_INFINITY;
    for (const each of steps) if (each.position >= Math.min(from, to) && each.position <= Math.max(from, to)) inside.add(each);
  }
  return inside;
}
