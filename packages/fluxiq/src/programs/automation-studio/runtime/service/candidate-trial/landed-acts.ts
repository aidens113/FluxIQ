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
//
// **A step that declared none, and changed its own page, is possibly lasting
// (t593).** On A8 crossborder `run-mv8c76i3-61b9ca89` a coupon press declared
// no lasting consequence, so no trial answered it and nothing ever put it back.
// A domain step (never one of Core's own) whose node declared `none` (`[]`),
// that succeeded and whose traced diff shows its own page changed -- the same
// document, something added or removed -- is answered too, with no classes and
// marked `possible`. Only positive evidence counts: no diff, a move to another
// page, or an effect check that found nothing landed answers nothing. A
// project build's ledgers record it as possibly lasting and never ask for it
// (`../../flow-bootstrap/site-reset/ledger.ts`); a ledger that does not record
// those, and the whole-candidate gate, which keeps declared acts only, drop it.

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
    if (attempt.subflowTarget || attempt.stateHeld || attempt.skipped || automationStudioAttemptSettled(attempt).status !== "succeeded" || noEffectSeen(attempt)) return;
    const node = nodes.get(attempt.nodeId);
    const declared = node?.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
    const consequences = Array.isArray(declared) ? automationStudioConsequencesInOrder(declared.filter(isAutomationStudioActionConsequence)) : [];
    // Declared none, and its own page changed: possibly lasting (header).
    const possible = !consequences.length && Array.isArray(declared) && declared.length === 0 && !attempt.definitionId.startsWith(CORE_NODE_PREFIX) && changedInPlace(attempt);
    if (!consequences.length && !possible) return;
    const control = automationStudioModelFacingControlWords(node?.parameterValues);
    acts.push({ step: index + 1, definitionId: attempt.definitionId, ...(node?.label ? { label: node.label } : {}), ...(control ? { control } : {}), consequences, ...(possible ? { possible: true as const } : {}) });
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

/** Core's own nodes, which act on nothing outside the run. */
const CORE_NODE_PREFIX = "builtin.";

/** The step's own trace shows its page changed where it stood: a diff on the same document that added or removed something (header). */
function changedInPlace(attempt: AutomationStudioNodeAttemptTrace): boolean {
  const diff: JsonObject | undefined = attempt.stateRefs?.stateDiff;
  if (!diff) return false;
  const moved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
  return !moved && (written(diff.added) || written(diff.removed));
}

/** A diff side the domain wrote something on. */
function written(value: JsonValue | undefined): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : false;
}
