// The lasting acts a trial left on the site (t462), so the build can undo them
// before its next trial (`../../flow-bootstrap/site-reset/`).
//
// Read off the trial's own trace and the graph it ran, never the page: a step
// counts when its final attempt settled `succeeded` (its act landed), it was
// neither skipped nor done by the page already showing its state (`stateHeld`:
// nothing was acted), and its node carries the step's declared lasting
// consequences (`declaredConsequences`, `../../executor/defensive/lasting-act.ts`)
// with at least one class Core knows. Steps are numbered as the trial's
// feedback numbers them (`./executed-steps.ts`), every step, past the listing's
// cut too, and the control is said in the same words the feedback gives.

import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, type AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialAct } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";
import { automationStudioTrialExecutedSteps } from "./executed-steps.ts";

/** Each lasting act the trial's steps landed, in the order they ran. */
export function automationStudioCandidateTrialLandedActs(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): AutomationStudioCandidateTrialAct[] {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const acts: AutomationStudioCandidateTrialAct[] = [];
  automationStudioTrialExecutedSteps(trace?.attempts ?? []).forEach(({ attempt }, index) => {
    if (attempt.stateHeld || attempt.skipped || automationStudioAttemptSettled(attempt).status !== "succeeded") return;
    const node = nodes.get(attempt.nodeId);
    const declared = node?.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
    const consequences = Array.isArray(declared) ? automationStudioConsequencesInOrder(declared.filter(isAutomationStudioActionConsequence)) : [];
    if (!consequences.length) return;
    const control = automationStudioModelFacingControlWords(node?.parameterValues);
    acts.push({ step: index + 1, definitionId: attempt.definitionId, ...(node?.label ? { label: node.label } : {}), ...(control ? { control } : {}), consequences });
  });
  return acts;
}
