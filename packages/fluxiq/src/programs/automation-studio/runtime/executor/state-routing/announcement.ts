import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityAction, automationStudioActivityHumanLabel, automationStudioActivityStepNumbers, emitAutomationStudioActivityStepSkipped } from "../../activity/index.ts";
import { chooseAutomationStudioStartNode } from "../start-node.ts";
import type { AutomationStudioStateRouteDecision } from "./decision.ts";

/**
 * Tells the chat that a step that could not run was passed over, and where the
 * run went on. A declared skip says what it always said ("Skipped “Not now”:
 * it was not shown"); a state route names the step it skipped and the step
 * the run continues with, in the same voice, since a step named by what it does
 * ("clicking “Set as my store”") reads after "Skipped" and "Continuing with" but
 * not after "Passed over" or "Continuing at" (`run-muw5zv4m-52d83027`). Neither
 * is a recovery, so neither says one started.
 */
export function announceAutomationStudioStateRoute(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, decision: AutomationStudioStateRouteDecision): void {
  if (decision.kind !== "declared" && decision.kind !== "routed") return;
  const said = decision.kind === "declared"
    ? automationStudioActivityAction({ parameters: node.parameterValues, label: node.label, notShown: true }) ?? "Skipped a step"
    : decision.record.outcome === "effect_holds"
      ? `Skipped ${stepName(flow, node)}: the page already shows what it does. Continuing with ${stepName(flow, decision.node)}`
      : decision.direction === "forward"
      ? `Skipped ${stepName(flow, node)}: the page is already past it. Continuing with ${stepName(flow, decision.node)}`
      : `Skipped ${stepName(flow, node)}: the page went back to an earlier step. Continuing with ${stepName(flow, decision.node)}`;
  const subject = node.label?.trim();
  emitAutomationStudioActivityStepSkipped({
    nodeId: node.id,
    said,
    skipped: { reason: decision.kind === "declared" ? "optional_absent" : "state_routed", ...(subject ? { subject } : {}) }
  });
}

/**
 * A step as a person reads it: its authored label, else what it does in the
 * words its step card says ("clicking “Set as my store”"), else its place in
 * run order, the number "Running step N of M" gives it (`activity/step/
 * numbers.ts`, from the Flow's own start). Never its place in the store's node
 * list: that said "step 15" for the step the overlay ran as step 8
 * (`run-muw5zv4m-52d83027`).
 */
function stepName(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode): string {
  const label = automationStudioActivityHumanLabel(node.label, 80);
  if (label) return `“${label}”`;
  const action = automationStudioActivityAction({ id: node.definitionId, parameters: node.parameterValues });
  if (action) return action.charAt(0).toLowerCase() + action.slice(1);
  const number = automationStudioActivityStepNumbers(flow, chooseAutomationStudioStartNode(flow).node?.id).numberOf(node.id);
  return number === undefined ? "a step" : `step ${number}`;
}
