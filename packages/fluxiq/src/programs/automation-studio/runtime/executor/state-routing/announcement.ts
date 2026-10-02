import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityAction, automationStudioActivityHumanLabel, emitAutomationStudioActivity } from "../../activity/index.ts";
import type { AutomationStudioStateRouteDecision } from "./decision.ts";

/**
 * Tells the chat that a step that could not run was passed over, and where the
 * run went on. A declared skip says what it always said ("Skipped “Not now”:
 * it was not shown"); a state route names the step passed over and the step
 * the run continues at. Neither is a recovery, so neither says one started.
 */
export function announceAutomationStudioStateRoute(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, decision: AutomationStudioStateRouteDecision): void {
  if (decision.kind !== "declared" && decision.kind !== "routed") return;
  const said = decision.kind === "declared"
    ? automationStudioActivityAction({ parameters: node.parameterValues, label: node.label, notShown: true }) ?? "Skipped a step"
    : decision.record.outcome === "effect_holds"
      ? `Passed over ${stepName(flow, node)}: the page already shows what it does. Continuing at ${stepName(flow, decision.node)}`
      : decision.direction === "forward"
      ? `Passed over ${stepName(flow, node)}: the page is already past it. Continuing at ${stepName(flow, decision.node)}`
      : `Passed over ${stepName(flow, node)}: the page went back to an earlier step. Continuing at ${stepName(flow, decision.node)}`;
  emitAutomationStudioActivity({ phase: "running", label: said, detail: { kind: "step", title: said, status: "succeeded", ref: node.id } });
}

/** A step as a person reads it: its authored label, else its place in the Flow. */
function stepName(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode): string {
  const label = automationStudioActivityHumanLabel(node.label, 80);
  return label ? `“${label}”` : `step ${flow.nodes.indexOf(node) + 1}`;
}
