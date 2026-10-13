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
//
// **Only an act whose effect appeared (t475).** A step that "succeeded" while
// its page showed nothing new -- its traced diff, on the same document, added
// and removed nothing -- or whose effect check found it had not landed, left
// nothing on the site to undo, and is not answered. Lane B round 10
// (`run-mv5tusj4-b7ee0630`) was asked to undo an Add to cart that added
// nothing, and the model removed a line the cart held before the build began.
// Where no diff was traced, the step counts as before.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialAct } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";
import { automationStudioTrialExecutedSteps } from "./executed-steps.ts";

/** Each lasting act the trial's steps landed, in the order they ran. */
export function automationStudioCandidateTrialLandedActs(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): AutomationStudioCandidateTrialAct[] {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const acts: AutomationStudioCandidateTrialAct[] = [];
  automationStudioTrialExecutedSteps(trace?.attempts ?? []).forEach(({ attempt }, index) => {
    if (attempt.stateHeld || attempt.skipped || automationStudioAttemptSettled(attempt).status !== "succeeded" || noEffectSeen(attempt)) return;
    const node = nodes.get(attempt.nodeId);
    const declared = node?.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
    const consequences = Array.isArray(declared) ? automationStudioConsequencesInOrder(declared.filter(isAutomationStudioActionConsequence)) : [];
    if (!consequences.length) return;
    const control = automationStudioModelFacingControlWords(node?.parameterValues);
    acts.push({ step: index + 1, definitionId: attempt.definitionId, ...(node?.label ? { label: node.label } : {}), ...(control ? { control } : {}), consequences });
  });
  return acts;
}

/** The step's own trace says its act left nothing: its effect check found it not landed, or its diff on the same document is empty (header). */
function noEffectSeen(attempt: AutomationStudioNodeAttemptTrace): boolean {
  if (attempt.effectCheck?.result === "not_landed") return true;
  const diff: JsonObject | undefined = attempt.stateRefs?.stateDiff;
  if (!diff) return false;
  const moved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
  return !moved && !written(diff.added) && !written(diff.removed);
}

/** A diff side the domain wrote something on. */
function written(value: JsonValue | undefined): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : false;
}
