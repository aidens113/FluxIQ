import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../model/index.ts";
import { runCanonicalAutomationStudioFlow as runExecutableComposition } from "../../../engine/automation/composite/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../../engine/automation/index.ts";
import { automationStudioClassifyLegacyStepAct } from "./executor/compatibility/index.ts";
import { copyAutomationExecutionOptions } from "../../../engine/automation/execution-admission/index.ts";

/** Supplies Studio legacy interpretation to the canonical composition owner. */
export async function runCanonicalAutomationStudioFlow(flow: AutomationStudioFlowArtifact, snapshots: AutomationStudioPublishedFlowSnapshot[], options: AutomationStudioGraphExecutionOptions = {}, deprecatedPublicationIds: Iterable<string> = [], onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void): Promise<AutomationStudioGraphExecutionTrace> {
  const placed = copyAutomationExecutionOptions(copyAutomationExecutionOptions(options), { classifyLegacyStepAct: options.classifyLegacyStepAct ?? automationStudioClassifyLegacyStepAct });
  return runExecutableComposition(flow, snapshots, placed, deprecatedPublicationIds, onExecutedTrace);
}
